import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import type { RunningServer } from 'backend';
import { isAllowedExternalUrl, isAllowedNavigation, isPathWithinRoot } from './securityPolicy';

// 1. Establish Top-Level Uncaught Exception Logging & Diagnostics
const logDirectory = path.join(app.getPath('userData'), 'logs');
const logFile = path.join(logDirectory, 'startup-error.log');

function logErrorAndShowBox(title: string, message: string, error: any) {
  const errorMsg = `${title}: ${message}\n${error && error.stack ? error.stack : error}\n`;
  process.stderr.write(errorMsg);
  
  try {
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
    }
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${errorMsg}`);
  } catch (logErr) {
    process.stderr.write(`Failed to write to log file: ${logErr}\n`);
  }

  dialog.showErrorBox(title, `${message}\n\n${error}`);
}

process.on('uncaughtException', (err) => {
  logErrorAndShowBox('Uncaught Exception during Startup', 'The application encountered an unexpected exception and will shut down.', err);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  logErrorAndShowBox('Unhandled Promise Rejection during Startup', 'The application encountered an unexpected promise rejection.', reason);
});

let mainWindow: BrowserWindow | null = null;
let runningServer: RunningServer | null = null;

// 2. Enforce Single-Instance Execution
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 3. Resolve Paths & Setup Backend
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
    // 4. Assert assets exist before starting the backend
    const frontendDir = app.isPackaged
      ? path.join(process.resourcesPath, 'frontend')
      : path.resolve(__dirname, '../../frontend/dist');

    const migrationsFolder = app.isPackaged 
      ? path.join(process.resourcesPath, 'drizzle')
      : path.resolve(__dirname, '../../backend/drizzle');

    const frontendIndexHtml = path.join(frontendDir, 'index.html');

    // Verify frontend/index.html
    if (!fs.existsSync(frontendIndexHtml)) {
      throw new Error(`Frontend asset validation failed: Could not find 'index.html' at resolved path: "${frontendIndexHtml}".\nVerify that the frontend has been compiled.`);
    }

    // Verify Drizzle migrations directory
    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(`Database validation failed: Could not find migrations folder at resolved path: "${migrationsFolder}".`);
    }

    // Load backend module dynamically to capture load/require exceptions inside try/catch
    let backendModule;
    try {
      backendModule = require('backend');
    } catch (loadErr: any) {
      throw new Error(`Embedded backend module failed to load. Check that native bindings (better-sqlite3) are compiled correctly for the target platform.\n\nDetail: ${loadErr.message || loadErr}`);
    }

    const { startServer, configureRuntimePaths, openDatabase, runMigrations } = backendModule;

    // Configure Runtime Directories
    configureRuntimePaths(paths);

    // Initialize Database and Run Schema Migrations
    const dbInstance = openDatabase(paths.databasePath);
    runMigrations(dbInstance, migrationsFolder);

    // Start Express on loopback, allocating an available port
    const serverInstance = await startServer({
      host: '127.0.0.1', // Only bind locally, hidden from LAN
      port: 0,           // OS assigns free port dynamically
      frontendDirectory: frontendDir
    });
    runningServer = serverInstance;

    console.log(`Embedded server started at: ${serverInstance.url}`);

    // Create BrowserWindow
    createWindow(serverInstance.url);
  } catch (err) {
    logErrorAndShowBox('Startup Failed', 'An error occurred while launching the CRM database or server.', err);
    app.quit();
  }
}

function createWindow(serverUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Hides native top window menu (File, Edit, etc.) for white-label cleanliness
  mainWindow.setMenuBarVisibility(false);

  // Load backend URL
  mainWindow.loadURL(serverUrl);

  // Keep the privileged renderer on the exact embedded-server origin.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, serverUrl)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    }
  });

  // Deny popups and open only allow-listed external URL schemes in the system handler.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 5. IPC Registration
ipcMain.handle('choose-backup-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('choose-backup-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'CRM Backups', extensions: ['db', 'crmbackup'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-application-info', async () => {
  return {
    version: app.getVersion(),
    userDataPath: userDataPath
  };
});

ipcMain.handle('open-path', async (_event, targetPath: unknown) => {
  if (typeof targetPath !== 'string' || !isPathWithinRoot(userDataPath, targetPath)) {
    throw new Error('The requested path is outside the application data directory.');
  }
  const errorMessage = await shell.openPath(path.resolve(targetPath));
  if (errorMessage) throw new Error(errorMessage);
});

ipcMain.handle('restart-application', () => {
  app.relaunch();
  app.exit(0);
});

// App Lifecycle
app.whenReady().then(startApplication);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && runningServer) {
    createWindow(runningServer.url);
  }
});

// 6. Clean Asynchronous Shutdown Lifecycle
app.on('before-quit', async (event) => {
  if (runningServer) {
    event.preventDefault();
    console.log('Shutting down server and database connections...');
    
    try {
      const { closeDatabase } = require('backend');
      closeDatabase();
      await runningServer.close();
      console.log('Server stopped successfully.');
    } catch (err) {
      console.error('Error during server shutdown:', err);
    }
    
    runningServer = null;
    app.exit(0);
  }
});
