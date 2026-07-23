import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {cleanupTempDatabase,setupTempDatabase} from './crm/helpers';
import {runSeed} from '../infrastructure/database/seed';
import {startServer,type RunningServer} from '../server';

describe('trusted local origin policy',()=>{
  let server:RunningServer|null=null;
  beforeEach(async()=>{delete process.env.CRM_TRUST_LOCAL_USERS;setupTempDatabase();await runSeed();server=await startServer({host:'127.0.0.1',port:0});});
  afterEach(async()=>{await server?.close();server=null;cleanupTempDatabase();delete process.env.CRM_TRUST_LOCAL_USERS;});

  async function localSession(origin?:string){
    const headers:Record<string,string>={'content-type':'application/json'};if(origin!==undefined)headers.origin=origin;
    return fetch(`${server!.url}/api/auth/local-session`,{method:'POST',headers,body:'{}'});
  }

  it('accepts the exact embedded origin and non-browser local clients',async()=>{
    expect((await localSession(server!.url)).status).toBe(200);
    expect((await localSession()).status).toBe(200);
  });

  it('rejects null, cross-port and non-loopback browser origins',async()=>{
    for(const origin of ['null','http://127.0.0.1:1','http://localhost:1','https://example.test']){
      const response=await localSession(origin);expect(response.status,origin).toBe(403);
    }
  });

  it('blocks a null-origin mutation before trusted-local authentication',async()=>{
    const response=await fetch(`${server!.url}/api/backups`,{method:'POST',headers:{'content-type':'application/json',origin:'null'},body:'{}'});
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({error:'ORIGIN_FORBIDDEN'});
  });
});
