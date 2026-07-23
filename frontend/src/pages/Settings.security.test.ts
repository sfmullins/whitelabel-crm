import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('backup settings secret persistence',()=>{
  it('does not read or write backup credentials through localStorage',()=>{
    const source=fs.readFileSync(new URL('./Settings.tsx',import.meta.url),'utf8');
    for(const key of ['backup_password','backup_s3_access_key','backup_s3_secret_key']){
      expect(source).not.toContain(`localStorage.getItem('${key}')`);
      expect(source).not.toContain(`localStorage.setItem('${key}'`);
      expect(source).toContain(`localStorage.removeItem('${key}')`);
    }
  });
});
