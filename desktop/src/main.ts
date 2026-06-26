import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { startServer, RunningServer } from '../../backend/dist/server';
import { configureRuntimePaths } from '../../backend/dist/config/runtimePaths';
import { openDatabase, closeDatabase } from '../../backend/dist/infrastructure/database/connection';
import { runMigrations } from '../../backend/dist/infrastructure/database/migrate';

let mainWindow: BrowserWindow | null = null;
let runningServer: RunningServer | null = null;

// 1. Enforce Single-Instance Execution
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

// 2. Resolve Paths & Setup Backend
const userDataPath = app.getPath('userData');
const paths = {
  dataDirectory: path.join(userDataPath, 'data'),
  databasePath: path.join(userDataPath, 'data', 'crm.db'),
  internalBackupDirectory: path.join(userDataPath, 'backups'),
  temporaryDirectory: path.join(userDataPath, 'temp'),
  logDirectory: path.join(userDataPath, 'logs')
};

// 3. Configure Runtime Directories
configureRuntimePaths(paths);

async function startApplication() {
  try {
    // 4. Initialize Database and Run Schema Migrations
    const dbInstance = openDatabase(paths.databasePath);
    const migrationsFolder = app.isPackaged 
      ? path.join(process.resourcesPath, 'drizzle')
      : path.resolve(__dirname, '../../../backend/drizzle');
    
    runMigrations(dbInstance, migrationsFolder);

    // 5. Start Express on loopback, allocating an available port
    const frontendDir = app.isPackaged
      ? path.join(process.resourcesPath, 'frontend')
      : path.resolve(__dirname, '../../../frontend/dist');

    runningServer = await startServer({
      host: '127.0.0.1', // Only bind locally, hidden from LAN
      port: 0,           // OS assigns free port dynamically
      frontendDirectory: frontendDir
    });

    console.log(`Embedded server started at: ${runningServer.url}`);

    // 6. Create BrowserWindow
    createWindow(runningServer.url);
  } catch (err) {
    console.error('Fatal error during application startup:', err);
    dialog.showErrorBox(
      'Startup Failed',
      `An error occurred while launching the CRM database or server:\n\n${err}`
    );
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

  // Prevent unexpected navigations outside the target loopback host
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.hostname !== '127.0.0.1') {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Deny unexpected window popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 7. IPC Registration
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

ipcMain.handle('open-path', async (event, targetPath) => {
  // Validate path against directory traversal
  const resolved = path.resolve(targetPath);
  if (resolved.startsWith(userDataPath) || resolved.startsWith('/')) {
    await shell.openPath(targetPath);
  }
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

// 8. Clean Asynchronous Shutdown Lifecycle
app.on('before-quit', async (event) => {
  if (runningServer) {
    event.preventDefault();
    console.log('Shutting down server and database connections...');
    
    // Close SQLite and stop server
    closeDatabase();
    
    try {
      await runningServer.close();
      console.log('Server stopped successfully.');
    } catch (err) {
      console.error('Error during server shutdown:', err);
    }
    
    runningServer = null;
    app.exit(0);
  }
});
