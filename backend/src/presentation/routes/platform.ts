import { Router } from 'express';
import { z } from 'zod';
import { PlatformRepository,type PlatformRequestIdentity } from '../../infrastructure/database/PlatformRepository';
import { WI10_EVENT_TYPES,WI10_TOKEN_SCOPES } from '../../infrastructure/database/wi10PlatformSchema';
import type { CrmRequest } from '../middleware/security';

const router=Router();
const platform=new PlatformRepository();
const uuid=z.string().uuid();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new Error(result.error.issues.map((issue)=>`${issue.path.join('.')||'request'}: ${issue.message}`).join('; '));return result.data;}
function fail(res:any,error:unknown):void{const message=error instanceof Error?error.message:String(error);const status=/not found/i.test(message)?404:/cannot|exceeds|permission|authenticated|not active|no longer holds/i.test(message)?403:/unique|already/i.test(message)?409:400;res.status(status).json({error:'PLATFORM_ERROR',message});}
function identity(req:CrmRequest):PlatformRequestIdentity {if(!req.crm?.identity)throw new Error('Authenticated identity is required');return req.crm.identity as PlatformRequestIdentity;}

const uuidPath=(name:string)=>({name,in:'path',required:true,schema:{type:'string',format:'uuid'}} as const);
const reportKeyPath={name:'key',in:'path',required:true,schema:{type:'string',enum:['executive','revenue','pipeline','activity','workload','concentration','operations']}} as const;
const commonErrors={'400':{description:'Invalid request'},'401':{description:'Unauthenticated'},'403':{description:'Missing permission or token scope'},'404':{description:'Resource not found'}} as const;
const mutableOne=(summary:string,parameterName='id')=>({
  get:{summary:`Read ${summary}`,parameters:[uuidPath(parameterName)],responses:{'200':{description:'Resource'},...commonErrors}},
  patch:{summary:`Update ${summary}`,parameters:[uuidPath(parameterName)],responses:{'200':{description:'Updated resource'},...commonErrors}},
});
const archiveOne=(summary:string,parameterName='id')=>({post:{summary:`Archive ${summary}`,parameters:[uuidPath(parameterName)],responses:{'200':{description:'Archived resource'},...commonErrors}}});

const openApiDocument={
  openapi:'3.1.0',
  info:{title:'WhiteLabelCRM Public API',version:'1.0.0',description:'Versioned local-first CRM integration API. Internal unversioned /api routes are not part of this compatibility contract.'},
  servers:[{url:'/api/v1'}],
  security:[{bearerAuth:[]}],
  components:{
    securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'WI8 session or wlc_ API token'}},
    parameters:{
      Limit:{name:'limit',in:'query',required:false,schema:{type:'integer',minimum:1,maximum:100}},
      Offset:{name:'offset',in:'query',required:false,schema:{type:'integer',minimum:0}},
      RequestId:{name:'x-request-id',in:'header',required:false,description:'Optional caller correlation ID. The server returns the effective ID in the response header.',schema:{type:'string',maxLength:120}},
    },
    schemas:{
      Error:{type:'object',required:['error','message'],properties:{error:{type:'string'},message:{type:'string'},details:{}}},
      Principal:{type:'object',required:['id','displayName','permissions','authType'],properties:{id:{type:'string',format:'uuid'},displayName:{type:'string'},email:{type:'string',format:'email'},permissions:{type:'array',items:{type:'string'}},authType:{type:'string',enum:['session','api_token']}}},
    },
  },
  paths:{
    '/openapi.json':{get:{summary:'Read the OpenAPI contract',parameters:[{$ref:'#/components/parameters/RequestId'}],responses:{'200':{description:'OpenAPI 3.1 document'},'401':{description:'Unauthenticated'}}}},
    '/me':{get:{summary:'Read the authenticated principal',parameters:[{$ref:'#/components/parameters/RequestId'}],responses:{'200':{description:'Authenticated principal',content:{'application/json':{schema:{$ref:'#/components/schemas/Principal'}}}},'401':{description:'Unauthenticated'}}}},
    '/organisations':{get:{summary:'List organisations',parameters:[{$ref:'#/components/parameters/Limit'},{$ref:'#/components/parameters/Offset'},{$ref:'#/components/parameters/RequestId'}],responses:{'200':{description:'Organisation list'},...commonErrors}},post:{summary:'Create an organisation',parameters:[{$ref:'#/components/parameters/RequestId'}],responses:{'201':{description:'Created organisation'},...commonErrors}}},
    '/organisations/{id}':mutableOne('organisation'),
    '/organisations/{id}/archive':archiveOne('organisation'),
    '/organisations/{organisationId}/contacts':{get:{summary:'List organisation contacts',parameters:[uuidPath('organisationId'),{$ref:'#/components/parameters/Limit'},{$ref:'#/components/parameters/Offset'}],responses:{'200':{description:'Contact list'},...commonErrors}},post:{summary:'Create an organisation contact',parameters:[uuidPath('organisationId')],responses:{'201':{description:'Created contact'},...commonErrors}}},
    '/contacts/{id}':mutableOne('contact'),
    '/contacts/{id}/archive':archiveOne('contact'),
    '/organisations/{organisationId}/engagements':{get:{summary:'List organisation engagements',parameters:[uuidPath('organisationId'),{$ref:'#/components/parameters/Limit'},{$ref:'#/components/parameters/Offset'}],responses:{'200':{description:'Engagement list'},...commonErrors}},post:{summary:'Create an organisation engagement',parameters:[uuidPath('organisationId')],responses:{'201':{description:'Created engagement'},...commonErrors}}},
    '/engagements/{id}':mutableOne('engagement'),
    '/engagements/{id}/archive':archiveOne('engagement'),
    '/organisations/{organisationId}/activities':{get:{summary:'List organisation activities',parameters:[uuidPath('organisationId'),{$ref:'#/components/parameters/Limit'},{$ref:'#/components/parameters/Offset'}],responses:{'200':{description:'Activity list'},...commonErrors}},post:{summary:'Create an organisation activity',parameters:[uuidPath('organisationId')],responses:{'201':{description:'Created activity'},...commonErrors}}},
    '/activities/{activityId}':mutableOne('activity','activityId'),
    '/activities/{activityId}/archive':archiveOne('activity','activityId'),
    '/reporting/catalog':{get:{summary:'List public report types',responses:{'200':{description:'Report catalogue'},...commonErrors}}},
    '/reporting/{key}':{get:{summary:'Run a report',parameters:[reportKeyPath],responses:{'200':{description:'Persisted report data'},...commonErrors}}},
    '/reporting/{key}/export.csv':{get:{summary:'Export a report as CSV',parameters:[reportKeyPath],responses:{'200':{description:'CSV report export',content:{'text/csv':{schema:{type:'string'}}}},...commonErrors}}},
  },
  'x-wlc-request-id':{requestHeader:'x-request-id',responseHeader:'x-request-id'},
  'x-wlc-versioning':{policy:'Additive changes remain within v1. Breaking request or response changes require a new major namespace.',tokenScopes:WI10_TOKEN_SCOPES},
} as const;

router.get('/v1/openapi.json',(_req,res)=>res.json(openApiDocument));
router.get('/v1/me',(req:CrmRequest,res)=>{const current=identity(req);res.json({id:current.id,email:current.email,displayName:current.displayName,roles:current.roles,permissions:current.permissions,teams:current.teams,authType:current.apiTokenId?'api_token':'session',apiTokenId:current.apiTokenId??null,apiTokenName:current.apiTokenName??null,requestId:req.crm?.requestId});});

router.get('/platform/api-tokens',(_req,res)=>res.json({items:platform.listApiTokens(),supportedScopes:WI10_TOKEN_SCOPES}));
router.post('/platform/api-tokens',(req:CrmRequest,res)=>{try{const input=parse(z.object({name:z.string().trim().min(1).max(120),scopes:z.array(z.enum(WI10_TOKEN_SCOPES)).min(1).max(WI10_TOKEN_SCOPES.length),expiresAt:z.string().datetime({offset:true}).nullable().optional()}).strict(),req.body);res.status(201).json(platform.createApiToken(identity(req),input));}catch(error){fail(res,error);}});
router.post('/platform/api-tokens/:id/rotate',(req:CrmRequest,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);const input=parse(z.object({expiresAt:z.string().datetime({offset:true}).nullable().optional()}).strict(),req.body??{});res.status(201).json(platform.rotateApiToken(identity(req),id,input));}catch(error){fail(res,error);}});
router.post('/platform/api-tokens/:id/revoke',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);res.json(platform.revokeApiToken(id));}catch(error){fail(res,error);}});

router.get('/platform/webhooks',(_req,res)=>res.json({items:platform.listWebhooks(),supportedEventTypes:WI10_EVENT_TYPES}));
router.post('/platform/webhooks',(req:CrmRequest,res)=>{try{const input=parse(z.object({name:z.string().trim().min(1).max(120),endpointUrl:z.string().url().max(2000),eventTypes:z.array(z.enum(WI10_EVENT_TYPES)).min(1).max(WI10_EVENT_TYPES.length)}).strict(),req.body);res.status(201).json(platform.createWebhook(identity(req),input));}catch(error){fail(res,error);}});
router.post('/platform/webhooks/:id/archive',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);res.json(platform.archiveWebhook(id));}catch(error){fail(res,error);}});
router.get('/platform/events',(req,res)=>{try{const {limit}=parse(z.object({limit:z.coerce.number().int().min(1).max(500).default(100)}).strict(),req.query);res.json({items:platform.listEvents(limit)});}catch(error){fail(res,error);}});
router.get('/platform/webhook-deliveries',(req,res)=>{try{const query=parse(z.object({status:z.enum(['pending','succeeded','failed','dead']).optional(),subscriptionId:uuid.optional(),limit:z.coerce.number().int().min(1).max(500).default(100)}).strict(),req.query);res.json({items:platform.listDeliveries(query)});}catch(error){fail(res,error);}});
router.post('/platform/webhook-deliveries/:id/retry',(req,res)=>{try{const {id}=parse(z.object({id:uuid}).strict(),req.params);res.json(platform.retryDelivery(id));}catch(error){fail(res,error);}});

export default router;
