import fs from 'node:fs';
import path from 'node:path';

function resolvedExistingPath(candidatePath:string):string {
  const resolved=path.resolve(candidatePath);
  try{return fs.realpathSync.native(resolved);}catch{return resolved;}
}

export function isPathWithinRoot(rootDirectory:string,candidatePath:string):boolean {
  if(typeof candidatePath!=='string'||candidatePath.length===0)return false;
  const root=resolvedExistingPath(rootDirectory);const candidate=resolvedExistingPath(candidatePath);const relative=path.relative(root,candidate);
  return relative===''||(!relative.startsWith('..')&&!path.isAbsolute(relative));
}

export function isAllowedNavigation(targetUrl:string,applicationUrl:string):boolean {
  try{const target=new URL(targetUrl);const application=new URL(applicationUrl);return (target.protocol==='http:'||target.protocol==='https:')&&target.origin===application.origin;}catch{return false;}
}

export function isAllowedExternalUrl(targetUrl:string):boolean {
  try{return ['http:','https:','mailto:'].includes(new URL(targetUrl).protocol);}catch{return false;}
}
