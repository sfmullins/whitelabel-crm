import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { runSeed } from '../infrastructure/database/seed';
import { cleanupTempDatabase,requestJson,setupTempDatabase } from './crm/helpers';

const ACME='20000000-0000-4000-8000-000000000001';

describe('WI5 operational records API',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('combines tasks and follow-ups and supports task transitions',async()=>{
    const { startServer }=await import('../server');
    const server=await startServer({host:'127.0.0.1',port:0});
    try{
      const queue=await requestJson(server.url,'/api/work?bucket=open&limit=200&offset=0');
      expect(queue.response.status).toBe(200);
      expect(queue.body.items.some((item:{workType:string})=>item.workType==='task')).toBe(true);
      expect(queue.body.items.some((item:{workType:string})=>item.workType==='follow_up')).toBe(true);
      const created=await requestJson(server.url,'/api/tasks',{method:'POST',body:JSON.stringify({organisationId:ACME,title:'Review operating model',priority:'high',dueAt:new Date(Date.now()+86400000).toISOString()})});
      expect(created.response.status).toBe(201);
      const completed=await requestJson(server.url,`/api/tasks/${created.body.id}/complete`,{method:'POST',body:'{}'});
      expect(completed.body.status).toBe('completed');
      expect(completed.body.completedAt).toBeTruthy();
      const reopened=await requestJson(server.url,`/api/tasks/${created.body.id}/reopen`,{method:'POST',body:'{}'});
      expect(reopened.body.status).toBe('open');
      expect(reopened.body.completedAt).toBeNull();
    }finally{await server.close();}
  });

  it('stores versioned document content and manual communication records',async()=>{
    const { startServer }=await import('../server');
    const server=await startServer({host:'127.0.0.1',port:0});
    try{
      const uploaded=await requestJson(server.url,'/api/documents',{method:'POST',body:JSON.stringify({title:'Acme evidence',filename:'evidence.txt',mimeType:'text/plain',contentBase64:Buffer.from('operational evidence').toString('base64'),links:[{entityType:'organisation',entityId:ACME}]})});
      expect(uploaded.response.status).toBe(201);
      expect(uploaded.body.versions).toHaveLength(1);
      const response=await fetch(`${server.url}/api/documents/${uploaded.body.id}/content`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('operational evidence');
      const communication=await requestJson(server.url,'/api/communications',{method:'POST',body:JSON.stringify({organisationId:ACME,channel:'meeting',direction:'internal',subject:'Leadership review',body:'Reviewed diagnostic findings.',occurredAt:new Date().toISOString()})});
      expect(communication.response.status).toBe(201);
      const listed=await requestJson(server.url,`/api/communications?organisationId=${ACME}`);
      expect(listed.body.some((item:{id:string})=>item.id===communication.body.id)).toBe(true);
    }finally{await server.close();}
  });

  it('executes allow-listed workflows idempotently',async()=>{
    const { startServer }=await import('../server');
    const server=await startServer({host:'127.0.0.1',port:0});
    try{
      const definition=await requestJson(server.url,'/api/workflows',{method:'POST',body:JSON.stringify({name:'Create review task',triggerType:'manual',conditions:{},actions:[{type:'create_task',title:'Workflow review',priority:'urgent'}]})});
      expect(definition.response.status).toBe(201);
      const payload={sourceType:'organisation',sourceId:ACME,triggerEvent:'manual',idempotencyKey:'wi5-test-idempotency',context:{organisationId:ACME}};
      const first=await requestJson(server.url,`/api/workflows/${definition.body.id}/run`,{method:'POST',body:JSON.stringify(payload)});
      expect(first.body.status).toBe('succeeded');
      expect(first.body.reused).toBe(false);
      const second=await requestJson(server.url,`/api/workflows/${definition.body.id}/run`,{method:'POST',body:JSON.stringify(payload)});
      expect(second.body.reused).toBe(true);
    }finally{await server.close();}
  });
});
