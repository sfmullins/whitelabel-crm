import { Router } from 'express';
import { z } from 'zod';
import { SecurityRepository } from '../../infrastructure/database/SecurityRepository';

const router=Router();
const security=new SecurityRepository();
const uuid=z.string().uuid();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new Error(result.error.issues.map((issue)=>issue.message).join('; '));return result.data;}
function fail(res:any,error:unknown){const message=error instanceof Error?error.message:String(error);const status=/not found/i.test(message)?404:/unique|already exists/i.test(message)?409:/only the owner|permission/i.test(message)?403:400;res.status(status).json({error:'ADMINISTRATION_ERROR',message});}

router.get('/admin/users',(_req,res)=>res.json(security.listUsers()));
router.post('/admin/users',(req,res)=>{
  try{const input=parse(z.object({email:z.string().email(),displayName:z.string().trim().min(1).max(120),roleKeys:z.array(z.string().trim().min(1)).min(1).max(5),teamIds:z.array(uuid).min(1).max(20).optional(),password:z.string().min(12).max(300).nullable().optional()}).strict(),req.body);res.status(201).json(security.createUser(input));}catch(error){fail(res,error);}
});
router.patch('/admin/users/:id',(req,res)=>{
  try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const input=parse(z.object({email:z.string().email().optional(),displayName:z.string().trim().min(1).max(120).optional(),status:z.enum(['active','invited','disabled']).optional(),roleKeys:z.array(z.string().trim().min(1)).min(1).max(5).optional(),teamIds:z.array(uuid).min(1).max(20).optional()}).strict().refine((value)=>Object.keys(value).length>0),req.body);res.json(security.updateUser(id,input));}catch(error){fail(res,error);}
});
router.post('/admin/users/:id/password',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const {password}=parse(z.object({password:z.string().min(12).max(300)}).strict(),req.body);security.setPassword(id,password);res.json({updated:true});}catch(error){fail(res,error);}});
router.post('/admin/users/:id/revoke-sessions',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);security.revokeUserSessions(id);res.json({revoked:true});}catch(error){fail(res,error);}});

router.get('/admin/teams',(_req,res)=>res.json(security.listTeams()));
router.post('/admin/teams',(req,res)=>{try{const input=parse(z.object({name:z.string().trim().min(1).max(120),description:z.string().trim().max(1000).nullable().optional(),userIds:z.array(uuid).max(200).optional()}).strict(),req.body);res.status(201).json(security.createTeam(input));}catch(error){fail(res,error);}});
router.patch('/admin/teams/:id',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const input=parse(z.object({name:z.string().trim().min(1).max(120).optional(),description:z.string().trim().max(1000).nullable().optional(),userIds:z.array(uuid).max(200).optional()}).strict().refine((value)=>Object.keys(value).length>0),req.body);res.json(security.updateTeam(id,input));}catch(error){fail(res,error);}});

router.get('/admin/roles',(_req,res)=>res.json({roles:security.listRoles(),permissions:security.listPermissions()}));
router.get('/admin/audit',(req,res)=>{
  try{const query=parse(z.object({actorUserId:uuid.optional(),action:z.string().trim().min(1).optional(),entityType:z.string().trim().min(1).optional(),organisationId:uuid.optional(),from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),limit:z.coerce.number().int().min(1).max(500).default(100),offset:z.coerce.number().int().min(0).default(0)}).strict(),req.query);res.json(security.listAudit(query));}catch(error){fail(res,error);}
});

export default router;
