import { Router } from 'express';
import { CreateEnrolmentSchema,RedeemEnrolmentSchema } from 'shared/onboarding';
import { OnboardingRepository } from '../../infrastructure/database/OnboardingRepository';
import { PlatformRepository } from '../../infrastructure/database/PlatformRepository';
import type { CrmRequest } from '../middleware/security';

const router=Router();
const onboarding=new OnboardingRepository();
const platform=new PlatformRepository();
const actor=(req:CrmRequest)=>req.crm?.identity?.id??null;
const requestId=(req:CrmRequest)=>req.crm?.requestId??'onboarding-request';

router.get('/onboarding/workspace',(req,res,next)=>{try{return res.json(onboarding.getWorkspace());}catch(error){next(error);}});
router.put('/onboarding/draft',(req:CrmRequest,res,next)=>{try{return res.json(onboarding.saveDraft(req.body,actor(req)));}catch(error){next(error);}});
router.post('/onboarding/validate',(req:CrmRequest,res,next)=>{try{return res.json(onboarding.validateDraft(actor(req)));}catch(error){next(error);}});
router.post('/onboarding/publish',async(req:CrmRequest,res,next)=>{
  try{
    const result=await onboarding.publish(actor(req));
    platform.recordEvent({eventType:'instance.published.v1',aggregateType:'instance',aggregateId:result.workspace.instance.id,actorUserId:actor(req),requestId:requestId(req),payload:{revision:result.deploymentProfile.profile.configurationRevision,deploymentMode:result.deploymentProfile.profile.deploymentMode}});
    return res.json({workspace:result.workspace,deploymentProfile:result.deploymentProfile,prePublicationBackupCreated:true});
  }catch(error){next(error);}
});
router.post('/onboarding/rollback/:revisionId',async(req:CrmRequest,res,next)=>{
  try{
    const result=await onboarding.rollback(req.params.revisionId,actor(req));
    platform.recordEvent({eventType:'instance.rolled_back.v1',aggregateType:'instance',aggregateId:result.workspace.instance.id,actorUserId:actor(req),requestId:requestId(req),payload:{sourceRevisionId:req.params.revisionId,newRevision:result.deploymentProfile.profile.configurationRevision}});
    return res.json({workspace:result.workspace,deploymentProfile:result.deploymentProfile,prePublicationBackupCreated:true});
  }catch(error){next(error);}
});
router.get('/onboarding/deployment-profile',(req,res,next)=>{try{const profile=onboarding.getPublishedProfile();if(req.query.download==='1'){res.setHeader('content-disposition',`attachment; filename="${profile.profile.businessIdentity.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'crm'}.crmdeploy.json"`);}return res.json(profile);}catch(error){next(error);}});
router.get('/onboarding/public-profile',(_req,res,next)=>{try{res.setHeader('cache-control','no-store');return res.json(onboarding.getPublishedProfile());}catch(error){next(error);}});

router.get('/onboarding/enrolments',(_req,res,next)=>{try{return res.json(onboarding.listEnrolments());}catch(error){next(error);}});
router.post('/onboarding/enrolments',(req:CrmRequest,res,next)=>{
  try{
    const input=CreateEnrolmentSchema.parse(req.body);const created=onboarding.createEnrolment(input,actor(req));
    return res.status(201).json({...created,enrolmentToken:created.code,code:undefined});
  }catch(error){next(error);}
});
router.post('/onboarding/enrolments/:id/revoke',(req,res,next)=>{try{onboarding.revokeEnrolment(req.params.id);return res.status(204).end();}catch(error){next(error);}});
router.post('/onboarding/enrolments/redeem',(req:CrmRequest,res,next)=>{
  try{
    const input=RedeemEnrolmentSchema.parse(req.body);const result=onboarding.redeemEnrolment(input,{ipAddress:req.ip,userAgent:req.header('user-agent')});
    platform.recordEvent({eventType:'device.enrolled.v1',aggregateType:'device',aggregateId:result.deviceId,actorUserId:result.user?.id??null,requestId:requestId(req),payload:{instanceId:result.deploymentProfile.profile.instanceId}});
    return res.json(result);
  }catch(error){next(error);}
});
router.get('/onboarding/devices',(_req,res,next)=>{try{return res.json(onboarding.listDevices());}catch(error){next(error);}});
router.post('/onboarding/devices/:id/revoke',(req:CrmRequest,res,next)=>{
  try{onboarding.revokeDevice(req.params.id);platform.recordEvent({eventType:'device.revoked.v1',aggregateType:'device',aggregateId:req.params.id,actorUserId:actor(req),requestId:requestId(req),payload:{}});return res.status(204).end();}catch(error){next(error);}
});

export default router;
