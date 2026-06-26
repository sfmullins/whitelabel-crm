import { contextBridge, ipcRenderer } from 'electron';

export interface ApplicationInfo {
  version: string;
  userDataPath: string;
}

const desktopBridge = {
  chooseBackupDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('choose-backup-directory');
  },
  chooseBackupFile: (): Promise<string | null> => {
    return ipcRenderer.invoke('choose-backup-file');
  },
  getApplicationInfo: (): Promise<ApplicationInfo> => {
    return ipcRenderer.invoke('get-application-info');
  },
  openPath: (targetPath: string): Promise<void> => {
    return ipcRenderer.invoke('open-path', targetPath);
  },
  restartApplication: (): Promise<void> => {
    return ipcRenderer.invoke('restart-application');
  }
};

contextBridge.exposeInMainWorld('desktop', desktopBridge);
