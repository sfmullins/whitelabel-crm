import type { NextFunction,Response } from 'express';
import { OwnershipRepository,type OwnedEntity } from '../../infrastructure/database/OwnershipRepository';
import type { CrmRequest } from './security';

function createdEntity(path:string,method:string):OwnedEntity|null{
  if(method!=='POST')return null;
  if(path==='/api/organisations')return 'organisation';
  if(/^\/api\/organisations\/[^/]+\/engagements$/.test(path))return 'engagement';
  if(path==='/api/tasks')return 'task';
  return null;
}

export function assignCreatedOwnership(repository=new OwnershipRepository()){
  return (req:CrmRequest,res:Response,next:NextFunction):void=>{
    const entityType=createdEntity(req.path,req.method.toUpperCase());
    if(!entityType)return next();
    const originalJson=res.json.bind(res);
    res.json=((body:unknown)=>{
      if(res.statusCode<400&&body&&typeof body==='object'){
        const id=(body as Record<string,unknown>).id;
        const identity=req.crm?.identity;
        if(typeof id==='string'&&identity)repository.assignIfMissing(entityType,id,identity.id,identity.teams[0]?.id??null);
      }
      return originalJson(body);
    }) as Response['json'];
    next();
  };
}
