import { Router } from 'express';
import { z } from 'zod';
import { EXTENSION_CAPABILITIES } from '../../application/extensions/ExtensionManifest';
import { ExtensionRepository } from '../../infrastructure/database/ExtensionRepository';
import { PlatformRepository,type PlatformRequestIdentity } from '../../infrastructure/database/PlatformRepository';
import type { CrmRequest } from '../middleware/security';

const router=Router();const extensions=new ExtensionRepository();const platform=new PlatformRepository();const uuid=z.string().uuid();const capabilities=z.array(z.enum(EXTENSION_CAPABILITIES)).max(EXTENSION_CAPABILITIES.length);
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new Error(result.error.issues.map((issue)=>`${issue.path.join('.')||'request'}: ${issue.message}`).join('; '));return result.data;}
function identity(req:CrmRequest):PlatformRequestIdentity{if(!req.crm?.identity)throw new Error('Authenticated identity is required');return req.crm.identity as PlatformRequestIdentity;}
function fail(res:any,error:unknown):void{const message=error instanceof Error?error.message:String(error);const status=/not found/i.test(message)?404:/cannot|requires|approved|permission|system-managed/i.test(message)?403:/newer|already|conflict|exists/i.test(message)?409:400;res.status(status).json({error:'EXTENSION_ERROR',message});}

router.get('/extensions',(_req,res)=>res.json({items:extensions.listExtensions(),supportedCapabilities:EXTENSION_CAPABILITIES}));
router.get('/extensions/:id/export',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);res.json(extensions.exportExtension(id));}catch(error){fail(res,error);}});
router.get('/extensions/:id',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const extension=extensions.getExtension(id);if(!extension)return res.status(404).json({error:'EXTENSION_NOT_FOUND',message:'Extension not found'});res.json(extension);}catch(error){fail(res,error);}});
router.post('/extensions/validate',(req,res)=>{try{const body=parse(z.object({package:z.unknown(),approvedCapabilities:capabilities.optional()}).strict(),req.body);res.json(extensions.validate(body.package,body.approvedCapabilities??[]));}catch(error){fail(res,error);}});
router.post('/extensions/install',async(req:CrmRequest,res)=>{
  try{
    const body=parse(z.object({package:z.unknown(),approvedCapabilities:capabilities.optional()}).strict(),req.body);const actor=identity(req);const result=await extensions.install(body.package,{actorUserId:actor.id,approvedCapabilities:body.approvedCapabilities??[]}) as any;
    if(!result.reused){const eventType=result.releases?.length>1?'extension.upgraded.v1':'extension.installed.v1';platform.recordEvent({eventType,aggregateType:'extension',aggregateId:String(result.id),actorUserId:actor.id,apiTokenId:actor.apiTokenId??null,requestId:req.crm?.requestId||'unknown',payload:{packageKey:result.packageKey,version:result.currentVersion,status:result.status}});}
    res.status(result.reused?200:201).json(result);
  }catch(error){fail(res,error);}
});
router.post('/extensions/:id/enable',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const actor=identity(req);const result=extensions.setEnabled(id,true) as any;platform.recordEvent({eventType:'extension.enabled.v1',aggregateType:'extension',aggregateId:id,actorUserId:actor.id,apiTokenId:actor.apiTokenId??null,requestId:req.crm?.requestId||'unknown',payload:{packageKey:result.packageKey,version:result.currentVersion,status:result.status}});res.json(result);}catch(error){fail(res,error);}});
router.post('/extensions/:id/disable',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const actor=identity(req);const result=extensions.setEnabled(id,false) as any;platform.recordEvent({eventType:'extension.disabled.v1',aggregateType:'extension',aggregateId:id,actorUserId:actor.id,apiTokenId:actor.apiTokenId??null,requestId:req.crm?.requestId||'unknown',payload:{packageKey:result.packageKey,version:result.currentVersion,status:result.status}});res.json(result);}catch(error){fail(res,error);}});

export default router;
