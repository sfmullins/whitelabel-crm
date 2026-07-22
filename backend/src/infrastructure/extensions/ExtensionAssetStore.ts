import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getRuntimePaths } from '../../config/runtimePaths';

export interface VerifiedExtensionAsset {
  key:string;
  relativePath:string;
  mediaType:string;
  sha256:string;
  sizeBytes:number;
  content:Buffer;
}

function safeSegment(value:string):string {
  if(!/^[a-z0-9][a-z0-9._-]*$/i.test(value))throw new Error('Unsafe extension asset path segment');
  return value;
}

function safeJoin(root:string,relativePath:string):string {
  const target=path.resolve(root,relativePath);
  const normalizedRoot=`${path.resolve(root)}${path.sep}`;
  if(target!==path.resolve(root)&&!target.startsWith(normalizedRoot))throw new Error('Extension asset path escapes its package directory');
  return target;
}

export class ExtensionAssetStore {
  private packageRoot(packageKey:string,version:string):string {
    const paths=getRuntimePaths();
    return path.join(paths.dataDirectory,'extensions','packages',safeSegment(packageKey),safeSegment(version));
  }

  stage(packageKey:string,version:string,assets:VerifiedExtensionAsset[]):{commit:()=>void;rollback:()=>void;finalDirectory:string}|null {
    if(!assets.length)return null;
    const paths=getRuntimePaths();
    const stagingRoot=path.join(paths.temporaryDirectory,`extension-assets-${crypto.randomUUID()}`);
    const finalDirectory=this.packageRoot(packageKey,version);
    if(fs.existsSync(finalDirectory))throw new Error(`Extension asset directory already exists for ${packageKey} ${version}`);
    fs.mkdirSync(stagingRoot,{recursive:true});
    try{
      for(const asset of assets){
        const target=safeJoin(stagingRoot,asset.relativePath);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,asset.content,{flag:'wx'});
      }
    }catch(error){fs.rmSync(stagingRoot,{recursive:true,force:true});throw error;}
    let committed=false;
    return {
      finalDirectory,
      commit:()=>{fs.mkdirSync(path.dirname(finalDirectory),{recursive:true});fs.renameSync(stagingRoot,finalDirectory);committed=true;},
      rollback:()=>fs.rmSync(committed?finalDirectory:stagingRoot,{recursive:true,force:true}),
    };
  }

  resolve(packageKey:string,version:string,relativePath:string,expectedSha256:string,expectedSize:number):string {
    const target=safeJoin(this.packageRoot(packageKey,version),relativePath);
    if(!fs.existsSync(target)||!fs.statSync(target).isFile())throw new Error('Extension asset is unavailable');
    const content=fs.readFileSync(target);if(content.length!==expectedSize)throw new Error('Extension asset size verification failed');
    const digest=crypto.createHash('sha256').update(content).digest('hex');if(digest!==expectedSha256)throw new Error('Extension asset checksum verification failed');
    return target;
  }
}
