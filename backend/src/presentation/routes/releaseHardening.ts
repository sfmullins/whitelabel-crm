import { Router } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../application/errors';
import { NotificationRepository } from '../../infrastructure/database/NotificationRepository';
import { CommunicationsHubService } from '../../application/services/CommunicationsHubService';

const router=Router();const notifications=new NotificationRepository();const hub=new CommunicationsHubService();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ValidationError('Invalid release-hardening request',result.error.flatten());return result.data;}
function forward(next:(error:unknown)=>void,error:unknown){if(error instanceof ValidationError)return next(error);return next(new ValidationError(error instanceof Error?error.message:String(error)));}

router.get('/notifications',(req,res,next)=>{try{const query=parse(z.object({status:z.enum(['unread','dismissed']).default('unread'),limit:z.coerce.number().int().min(1).max(500).default(100)}).strict(),req.query);res.json(notifications.list(query.status,query.limit));}catch(error){forward(next,error);}});
router.post('/notifications/:id/dismiss',(req,res,next)=>{try{const {id}=parse(z.object({id:z.string().uuid()}).strict(),req.params);res.json(notifications.dismiss(id));}catch(error){forward(next,error);}});
router.post('/operations-reconcile-outbound',(_req,res,next)=>{try{res.json(hub.reconcilePendingOutbound());}catch(error){forward(next,error);}});

export default router;
