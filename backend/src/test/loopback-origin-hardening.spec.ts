import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { startServer,type RunningServer } from '../server';

const RANGE='from=2024-01-01T00%3A00%3A00.000Z&to=2028-12-31T23%3A59%3A59.999Z';

describe('trusted loopback origin hardening',()=>{
  beforeEach(async()=>{delete process.env.CRM_TRUST_LOCAL_USERS;setupTempDatabase();await runSeed();});
  afterEach(()=>{delete process.env.CRM_TRUST_LOCAL_USERS;cleanupTempDatabase();});

  it('allows same-origin loopback access but rejects a hostile browser origin without a bearer token',async()=>{
    let server:RunningServer|null=null;
    try{
      server=await startServer({host:'127.0.0.1',port:0});
      const local=await fetch(`${server.url}/api/reporting/executive?${RANGE}`,{headers:{origin:server.url}});expect(local.status).toBe(200);
      const hostile=await fetch(`${server.url}/api/reporting/executive?${RANGE}`,{headers:{origin:'https://attacker.example'}});expect(hostile.status).toBe(401);
      const noOrigin=await fetch(`${server.url}/api/reporting/executive?${RANGE}`);expect(noOrigin.status).toBe(200);
    }finally{await server?.close();}
  });
});
