import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {resolveBackupManifestPath,resolveBackupPath} from '../infrastructure/backup/BackupPathPolicy';

describe('backup path policy',()=>{
  let fixture='';let root='';let outside='';
  beforeEach(()=>{fixture=fs.mkdtempSync(path.join(os.tmpdir(),'crm-backup-policy-'));root=path.join(fixture,'backups');outside=path.join(fixture,'outside');fs.mkdirSync(root);fs.mkdirSync(outside);});
  afterEach(()=>{fs.rmSync(fixture,{recursive:true,force:true});});

  it('accepts supported filenames and derives the matching manifest path',()=>{
    expect(resolveBackupPath(root,'crm-backup-2026.db')).toBe(path.join(root,'crm-backup-2026.db'));
    expect(resolveBackupManifestPath(root,'crm-backup-2026.db')).toBe(path.join(root,'crm-backup-2026.manifest.json'));
    expect(resolveBackupPath(root,'crm-backup-2026.crmbackup')).toBe(path.join(root,'crm-backup-2026.crmbackup'));
  });

  it('rejects traversal, separators and unsupported extensions',()=>{
    for(const value of ['../outside.db','subdir/backup.db','subdir\\backup.db','backup.sqlite','/tmp/backup.db']){
      expect(()=>resolveBackupPath(root,value)).toThrow();
    }
  });

  it('rejects an existing symlink that resolves outside the backup directory',()=>{
    const externalFile=path.join(outside,'external.db');fs.writeFileSync(externalFile,'external');
    fs.symlinkSync(externalFile,path.join(root,'linked.db'),'file');
    expect(()=>resolveBackupPath(root,'linked.db')).toThrow(/escapes/);
  });
});
