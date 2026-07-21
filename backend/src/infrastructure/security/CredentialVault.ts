import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getRuntimePaths } from '../../config/runtimePaths';

interface EncryptedCredentialEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

function chmodOwnerOnly(filePath: string): void {
  try { fs.chmodSync(filePath,0o600); } catch { /* Windows permissions are managed by the host account. */ }
}

export class CredentialVault {
  private readonly root: string;
  private readonly keyPath: string;

  constructor(root=path.join(getRuntimePaths().dataDirectory,'credentials')) {
    this.root=path.resolve(root);
    this.keyPath=path.join(this.root,'.vault-key');
    fs.mkdirSync(this.root,{recursive:true});
  }

  store(credentialKey:string,secret:Record<string,string>):void {
    const key=this.loadOrCreateKey();
    const iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    const plaintext=Buffer.from(JSON.stringify(secret),'utf8');
    const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    const envelope:EncryptedCredentialEnvelope={version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
    const target=this.resolveKey(credentialKey);
    const temporary=`${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
    fs.writeFileSync(temporary,JSON.stringify(envelope),{encoding:'utf8',flag:'wx',mode:0o600});
    fs.renameSync(temporary,target);
    chmodOwnerOnly(target);
  }

  read(credentialKey:string):Record<string,string> {
    const envelope=JSON.parse(fs.readFileSync(this.resolveKey(credentialKey),'utf8')) as EncryptedCredentialEnvelope;
    if(envelope.version!==1)throw new Error('Unsupported credential envelope version');
    const decipher=crypto.createDecipheriv('aes-256-gcm',this.loadOrCreateKey(),Buffer.from(envelope.iv,'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    const plaintext=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
    const parsed=JSON.parse(plaintext.toString('utf8')) as Record<string,unknown>;
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))throw new Error('Credential payload is invalid');
    return Object.fromEntries(Object.entries(parsed).map(([key,value])=>[key,String(value)]));
  }

  remove(credentialKey:string):void { fs.rmSync(this.resolveKey(credentialKey),{force:true}); }
  exists(credentialKey:string):boolean { return fs.existsSync(this.resolveKey(credentialKey)); }

  private loadOrCreateKey():Buffer {
    if(!fs.existsSync(this.keyPath)){
      fs.writeFileSync(this.keyPath,crypto.randomBytes(32),{flag:'wx',mode:0o600});
      chmodOwnerOnly(this.keyPath);
    }
    const key=fs.readFileSync(this.keyPath);
    if(key.byteLength!==32)throw new Error('Credential vault key is invalid');
    return key;
  }

  private resolveKey(credentialKey:string):string {
    if(!/^[a-zA-Z0-9_-]{8,120}$/.test(credentialKey))throw new Error('Credential key is invalid');
    const resolved=path.resolve(this.root,`${credentialKey}.json`);
    if(!resolved.startsWith(`${this.root}${path.sep}`))throw new Error('Credential key escapes the vault directory');
    return resolved;
  }
}
