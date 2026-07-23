import { contextBridge, ipcRenderer } from 'electron';

export interface ApplicationInfo {
  version: string;
  userDataPath: string;
  deploymentMode:'managed'|'standalone';
  instanceId:string|null;
  configurationRevision:number|null;
}

const desktopBridge = {
  chooseBackupDirectory: (): Promise<string | null> => ipcRenderer.invoke('choose-backup-directory'),
  chooseBackupFile: (): Promise<string | null> => ipcRenderer.invoke('choose-backup-file'),
  getApplicationInfo: (): Promise<ApplicationInfo> => ipcRenderer.invoke('get-application-info'),
  openPath: (targetPath: string): Promise<void> => ipcRenderer.invoke('open-path', targetPath),
  restartApplication: (): Promise<void> => ipcRenderer.invoke('restart-application')
};

contextBridge.exposeInMainWorld('desktop', desktopBridge);
