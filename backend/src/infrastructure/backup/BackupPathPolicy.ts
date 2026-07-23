import path from 'node:path';

const ALLOWED_BACKUP_EXTENSIONS=new Set(['.db','.crmbackup']);
const SAFE_BACKUP_FILENAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export function resolveBackupPath(rootDirectory:string,filename:string):string {
  if(typeof filename!=='string'||!SAFE_BACKUP_FILENAME.test(filename)||filename.includes('/')||filename.includes('\\'))throw new Error('Invalid backup filename');
  if(!ALLOWED_BACKUP_EXTENSIONS.has(path.extname(filename).toLowerCase()))throw new Error('Unsupported backup file type');
  const root=path.resolve(rootDirectory);const target=path.resolve(root,filename);const relative=path.relative(root,target);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Backup path escapes the configured backup directory');
  return target;
}

export function resolveBackupManifestPath(rootDirectory:string,filename:string):string {
  const backupPath=resolveBackupPath(rootDirectory,filename);const extension=path.extname(backupPath);return backupPath.slice(0,-extension.length)+'.manifest.json';
}
