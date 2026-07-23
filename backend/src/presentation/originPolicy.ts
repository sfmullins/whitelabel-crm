import type {Request} from 'express';

function isLoopbackHostname(hostname:string):boolean {
  return hostname==='localhost'||hostname==='127.0.0.1'||hostname==='::1';
}

export function isExactLoopbackOrigin(req:Request):boolean {
  const origin=req.header('origin');
  const host=req.get('host');
  if(!origin||origin==='null'||!host)return false;
  try{
    const parsed=new URL(origin);
    const expectedOrigin=`${req.protocol}://${host}`;
    return isLoopbackHostname(parsed.hostname)&&parsed.origin===expectedOrigin;
  }catch{return false;}
}

export function isTrustedLocalRequestOrigin(req:Request):boolean {
  return !req.header('origin')||isExactLoopbackOrigin(req);
}

export function isAllowedApiOrigin(req:Request,configuredOrigins:ReadonlySet<string>):boolean {
  const origin=req.header('origin');
  if(!origin)return true;
  if(origin==='null')return false;
  return configuredOrigins.has(origin)||isExactLoopbackOrigin(req);
}
