import type {Request} from 'express';

export type ApiOriginClassification='absent'|'same-origin-loopback'|'configured'|'null'|'malformed'|'cross-origin';
export interface ApiOriginAssessment {allowed:boolean;classification:ApiOriginClassification;origin:string|null;expectedOrigin:string|null;}

function isLoopbackHostname(hostname:string):boolean {
  return hostname==='localhost'||hostname==='127.0.0.1'||hostname==='::1';
}

function expectedOrigin(req:Request):string|null{
  const host=req.get('host');return host?`${req.protocol}://${host}`:null;
}

export function assessApiOrigin(req:Request,configuredOrigins:ReadonlySet<string>):ApiOriginAssessment{
  const origin=req.header('origin')??null;const expected=expectedOrigin(req);
  if(!origin)return {allowed:true,classification:'absent',origin:null,expectedOrigin:expected};
  if(origin==='null')return {allowed:false,classification:'null',origin,expectedOrigin:expected};
  let parsed:URL;
  try{parsed=new URL(origin);}catch{return {allowed:false,classification:'malformed',origin,expectedOrigin:expected};}
  if(configuredOrigins.has(parsed.origin))return {allowed:true,classification:'configured',origin:parsed.origin,expectedOrigin:expected};
  if(expected&&isLoopbackHostname(parsed.hostname)&&parsed.origin===expected)return {allowed:true,classification:'same-origin-loopback',origin:parsed.origin,expectedOrigin:expected};
  return {allowed:false,classification:'cross-origin',origin:parsed.origin,expectedOrigin:expected};
}

export function isExactLoopbackOrigin(req:Request):boolean{return assessApiOrigin(req,new Set()).classification==='same-origin-loopback';}
export function isTrustedLocalRequestOrigin(req:Request):boolean{const result=assessApiOrigin(req,new Set());return result.classification==='absent'||result.classification==='same-origin-loopback';}
export function isAllowedApiOrigin(req:Request,configuredOrigins:ReadonlySet<string>):boolean{return assessApiOrigin(req,configuredOrigins).allowed;}
