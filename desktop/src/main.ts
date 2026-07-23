import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import type { RunningServer } from 'backend';
import { isAllowedExternalUrl, isAllowedNavigation, isPathWithinRoot } from './securityPolicy';
import { resolveDeploymentRuntime,type DeploymentRuntime } from './deploymentProfile';
import { getReleaseMetadata } from 'backend';

const logDirectory = path.join(app.getPath('userData'), 'logs');
const logFile = path.join(logDirectory, 'startup-error.log');

function logErrorAndShowBox(title: string, message: string, error: unknown) {
  const detail=error instanceof Error?(error.stack||error.message):String(error);
  const errorMsg = `${title}: ${message}\n${detail}\n`;
  process.stderr.write(errorMsg);
  try {if (!fs.existsSync(logDirectory)) fs.mkdirSync(logDirectory, { recursive: true });fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${errorMsg}`);} catch (logErr) {process.stderr.write(`Failed to write to log file: ${logErr}\n`);}
  dialog.showErrorBox(title, `${message}\n\n${detail}`);
}

process.on('uncaughtException', (err) => {logErrorAndShowBox('Uncaught Exception during Startup', 'The application encountered an unexpected exception and will shut down.', err);app.quit();});
process.on('unhandledRejection', (reason) => {logErrorAndShowBox('Unhandled Promise Rejection during Startup', 'The application encountered an unexpected promise rejection.', reason);});

let mainWindow: BrowserWindow | null = null;
let runningServer: RunningServer | null = null;
let deploymentRuntime:DeploymentRuntime={mode:'standalone',envelope:null,instanceId:null,instanceUrl:null,configurationRevision:null};

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
else app.on('second-instance', () => {if (mainWindow) {if (mainWindow.isMinimized()) mainWindow.restore();mainWindow.focus();}});

const userDataPath = app.getPath('userData');
const paths = {
  dataDirectory: path.join(userDataPath, 'data'),
  databasePath: path.join(userDataPath, 'data', 'crm.db'),
  internalBackupDirectory: path.join(userDataPath, 'backups'),
  temporaryDirectory: path.join(userDataPath, 'temp'),
  logDirectory: path.join(userDataPath, 'logs')
};

async function startApplication() {
  try {
    const allowInsecureManaged=!app.isPackaged&&process.env.CRM_ALLOW_INSECURE_MANAGED==='true';
    deploymentRuntime=await resolveDeploymentRuntime(process.resourcesPath,{allowInsecureManaged,currentClientVersion:app.getVersion()});
    if(deploymentRuntime.mode==='managed'){
      if(!deploymentRuntime.instanceUrl)throw new Error('Verified managed-client profile did not provide an instance URL');
      console.log(`Starting managed client for instance ${deploymentRuntime.instanceId} at revision ${deploymentRuntime.configurationRevision}`);
      createWindow(deploymentRuntime.instanceUrl,deploymentRuntime.instanceUrl);
      return;
    }

    const frontendDir = app.isPackaged ? path.join(process.resourcesPath, 'frontend') : path.resolve(__dirname, '../../frontend/dist');
    const migrationsFolder = app.isPackaged ? path.join(process.resourcesPath, 'drizzle') : path.resolve(__dirname, '../../backend/drizzle');
    const frontendIndexHtml = path.join(frontendDir, 'index.html');
    if (!fs.existsSync(frontendIndexHtml)) throw new Error(`Frontend asset validation failed: Could not find 'index.html' at resolved path: "${frontendIndexHtml}". Verify that the frontend has been compiled.`);
    if (!fs.existsSync(migrationsFolder)) throw new Error(`Database validation failed: Could not find migrations folder at resolved path: "${migrationsFolder}".`);

    let backendModule;
    try {backendModule = require('backend');} catch (loadErr) {const detail=loadErr instanceof Error?loadErr.message:String(loadErr);throw new Error(`Embedded backend module failed to load. Check that native bindings are compiled correctly for the target platform. Detail: ${detail}`);}
    const { startServer, configureRuntimePaths, openDatabase, runMigrations } = backendModule;
    configureRuntimePaths(paths);
    const dbInstance = openDatabase(paths.databasePath);
    runMigrations(dbInstance, migrationsFolder);
    const serverInstance = await startServer({host: '127.0.0.1',port: 0,frontendDirectory: frontendDir});
    runningServer = serverInstance;
    console.log(`Standalone embedded server started at: ${serverInstance.url}`);
    createWindow(serverInstance.url,serverInstance.url);
  } catch (err) {logErrorAndShowBox('Startup Failed', 'An error occurred while launching the CRM.', err);app.quit();}
}

function createWindow(targetUrl: string,trustedOrigin:string) {
  mainWindow = new BrowserWindow({width: 1200,height: 800,minWidth: 800,minHeight: 600,webPreferences: {nodeIntegration: false,contextIsolation: true,sandbox: true,preload: path.join(__dirname, 'preload.js')}});
  mainWindow.setMenuBarVisibility(false);
  void mainWindow.loadURL(targetUrl);
  mainWindow.webContents.on('will-navigate', (event, url) => {if (!isAllowedNavigation(url, trustedOrigin)) {event.preventDefault();if (isAllowedExternalUrl(url)) void shell.openExternal(url);}});
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {if (isAllowedExternalUrl(url)) void shell.openExternal(url);return { action: 'deny' };});
  mainWindow.on('closed', () => {mainWindow = null;});
}

ipcMain.handle('choose-backup-directory', async () => {
  if(deploymentRuntime.mode==='managed')throw new Error('Backups are administered on the shared CRM instance, not on employee devices.');
  const result = await dialog.showOpenDialog(mainWindow!, {properties: ['openDirectory', 'createDirectory']});return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('choose-backup-file', async () => {
  if(deploymentRuntime.mode==='managed')throw new Error('Restores are administered on the shared CRM instance, not on employee devices.');
  const result = await dialog.showOpenDialog(mainWindow!, {properties: ['openFile'],filters: [{ name: 'CRM Backups', extensions: ['db', 'crmbackup'] }]});return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('get-application-info', async () => ({...getReleaseMetadata({version:app.getVersion(),deploymentMode:deploymentRuntime.mode}),userDataPath,deploymentMode:deploymentRuntime.mode,instanceId:deploymentRuntime.instanceId,configurationRevision:deploymentRuntime.configurationRevision}));
ipcMain.handle('open-path', async (_event, targetPath: unknown) => {if (typeof targetPath !== 'string' || !isPathWithinRoot(userDataPath, targetPath)) throw new Error('The requested path is outside the application data directory.');const errorMessage = await shell.openPath(path.resolve(targetPath));if (errorMessage) throw new Error(errorMessage);});
ipcMain.handle('restart-application', () => {app.relaunch();app.exit(0);});

app.whenReady().then(startApplication);
app.on('window-all-closed', () => {if (process.platform !== 'darwin') app.quit();});
app.on('activate', () => {if (BrowserWindow.getAllWindows().length !== 0)return;if(deploymentRuntime.mode==='managed'&&deploymentRuntime.instanceUrl)createWindow(deploymentRuntime.instanceUrl,deploymentRuntime.instanceUrl);else if(runningServer)createWindow(runningServer.url,runningServer.url);});
app.on('before-quit', async (event) => {
  if (!runningServer) return;
  event.preventDefault();console.log('Shutting down standalone server and database connections...');
  try {const { closeDatabase } = require('backend');closeDatabase();await runningServer.close();console.log('Server stopped successfully.');} catch (err) {console.error('Error during server shutdown:', err);}
  runningServer = null;app.exit(0);
});
