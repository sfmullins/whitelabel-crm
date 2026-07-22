import { Router } from 'express';
import { z } from 'zod';
import { OwnershipRepository,type OwnedEntity } from '../../infrastructure/database/OwnershipRepository';

const router=Router();
const ownership=new OwnershipRepository();
const params=z.object({entityType:z.enum(['organisation','engagement','task']),id:z.string().uuid()}).strict();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new Error(result.error.issues.map((issue)=>issue.message).join('; '));return result.data;}
function fail(res:any,error:unknown){const message=error instanceof Error?error.message:String(error);res.status(/not found/i.test(message)?404:400).json({error:'OWNERSHIP_ERROR',message});}

router.get('/ownership/:entityType/:id',(req,res)=>{try{const value=parse(params,req.params);res.json(ownership.get(value.entityType as OwnedEntity,value.id));}catch(error){fail(res,error);}});
router.patch('/ownership/:entityType/:id',(req,res)=>{try{const value=parse(params,req.params);const input=parse(z.object({ownerUserId:z.string().uuid(),ownerTeamId:z.string().uuid().nullable()}).strict(),req.body);res.json(ownership.update(value.entityType as OwnedEntity,value.id,input));}catch(error){fail(res,error);}});

export default router;
