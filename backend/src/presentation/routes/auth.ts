import { Router } from 'express';
import { z } from 'zod';
import { SecurityRepository } from '../../infrastructure/database/SecurityRepository';
import type { CrmRequest } from '../middleware/security';
import { isLoopback } from '../middleware/security';

const router=Router();
const security=new SecurityRepository();
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const result=schema.safeParse(value);if(!result.success)throw new Error(result.error.issues.map((issue)=>issue.message).join('; '));return result.data;};
const message=(error:unknown)=>error instanceof Error?error.message:String(error);

router.post('/auth/login',(req,res)=>{
  try{
    const input=parse(z.object({email:z.string().email(),password:z.string().min(1),ttlHours:z.number().int().min(1).max(720).optional()}).strict(),req.body);
    const result=security.createSessionForPassword(input.email,input.password,{ttlHours:input.ttlHours,ipAddress:req.ip,userAgent:req.header('user-agent')});
    security.recordAudit({actorUserId:result.user.id,action:'auth.login',entityType:'user',entityId:result.user.id,requestId:String(req.header('x-request-id')||'login'),route:'/api/auth/login',method:'POST',metadata:{ipAddress:req.ip}});
    res.json(result);
  }catch(error){res.status(401).json({error:'INVALID_CREDENTIALS',message:message(error)});}
});

router.post('/auth/local-session',(req,res)=>{
  try{
    if(!isLoopback(req)||process.env.CRM_TRUST_LOCAL_USERS==='false'){res.status(403).json({error:'LOCAL_SESSION_DISABLED',message:'Trusted local sessions are unavailable'});return;}
    const input=parse(z.object({userId:z.string().uuid().optional()}).strict(),req.body??{});const identity=security.resolveLocalUser(input.userId);
    if(!identity){res.status(404).json({error:'USER_NOT_FOUND',message:'Local CRM user not found or disabled'});return;}
    security.recordAudit({actorUserId:identity.id,action:'auth.local_session',entityType:'user',entityId:identity.id,requestId:String(req.header('x-request-id')||'local-session'),route:'/api/auth/local-session',method:'POST',metadata:{ipAddress:req.ip}});
    res.json({user:identity,localTrusted:true});
  }catch(error){res.status(400).json({error:'INVALID_LOCAL_SESSION',message:message(error)});}
});

router.get('/auth/me',(req:CrmRequest,res)=>{res.json({user:req.crm?.identity??null});});
router.get('/auth/local-users',(req,res)=>{
  if(!isLoopback(req)||process.env.CRM_TRUST_LOCAL_USERS==='false'){res.status(403).json({error:'LOCAL_SESSION_DISABLED',message:'Trusted local users are unavailable'});return;}
  res.json(security.listUsers().filter((user)=>user.status==='active').map((user)=>({id:user.id,email:user.email,displayName:user.displayName,roles:user.roles})));
});
router.post('/auth/logout',(req:CrmRequest,res)=>{if(req.crm?.identity?.sessionId)security.revokeSession(req.crm.identity.sessionId);res.json({loggedOut:true});});
router.post('/auth/password',(req:CrmRequest,res)=>{try{const input=parse(z.object({password:z.string().min(12)}).strict(),req.body);security.setPassword(String(req.crm?.identity?.id),input.password);res.json({updated:true});}catch(error){res.status(400).json({error:'PASSWORD_UPDATE_FAILED',message:message(error)});}});

export default router;
