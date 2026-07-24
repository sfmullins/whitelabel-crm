import type { NextFunction,Response } from 'express';
import { OnboardingRepository } from '../../infrastructure/database/OnboardingRepository';
import type { CrmRequest } from './security';

const PROVISIONING_PREFIXES=[
  '/api/onboarding',
  '/api/auth',
  '/api/admin/users',
  '/api/admin/roles',
  '/api/admin/teams',
  '/api/custom-fields',
  '/api/custom-objects',
  '/api/extensions',
  '/api/communication-accounts',
] as const;

function allowedDuringProvisioning(path:string):boolean{
  return PROVISIONING_PREFIXES.some((prefix)=>path===prefix||path.startsWith(`${prefix}/`));
}

function bypassLifecycleForIsolatedTests():boolean{return process.env.NODE_ENV==='test'&&process.env.CRM_ENFORCE_INSTANCE_LIFECYCLE!=='true';}

export function enforceInstanceLifecycle(repository=new OnboardingRepository()){
  return (req:CrmRequest,res:Response,next:NextFunction):void=>{
    if(bypassLifecycleForIsolatedTests()||!req.path.startsWith('/api')||allowedDuringProvisioning(req.path))return next();
    const status=repository.getStatus();
    if(status.status==='active'&&status.hasPublishedRevision)return next();
    if(req.crm)req.crm.rejectionReason=status.status==='suspended'?'instance-suspended':'onboarding-required';
    const requestId=req.crm?.requestId??String(res.getHeader('x-request-id')??'unknown');
    if(status.status==='suspended'){
      res.status(423).json({error:'INSTANCE_SUSPENDED',message:'The CRM instance is suspended',requestId});return;
    }
    res.status(409).json({error:'INSTANCE_ONBOARDING_REQUIRED',message:'The CRM instance must be published before the workspace can be used',requestId});
  };
}
