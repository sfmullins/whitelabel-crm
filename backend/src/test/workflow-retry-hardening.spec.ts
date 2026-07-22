import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { WorkflowRepository } from '../infrastructure/database/WorkflowRepository';
import { WorkRepository } from '../infrastructure/database/WorkRepository';

const ACME='20000000-0000-4000-8000-000000000001';

describe('workflow retry hardening',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('returns the same direct retry and never repeats successful parent actions',()=>{
    const workflows=new WorkflowRepository();
    const definition=workflows.createDefinition({name:'Retry chain',triggerType:'manual',actions:[{type:'create_task',organisationId:ACME,title:'One task only'},{type:'create_email_draft',organisationId:ACME,subject:'Missing account',body:'Fails'}]});
    const parent=workflows.run({workflowId:String(definition.id),sourceType:'organisation',sourceId:ACME,triggerEvent:'manual',idempotencyKey:'retry-parent',context:{organisationId:ACME}});
    expect(parent.status).toBe('partially_failed');
    const firstRetry=workflows.retryRun(String(parent.id));
    const repeatedRetry=workflows.retryRun(String(parent.id));
    expect(repeatedRetry.id).toBe(firstRetry.id);
    expect(repeatedRetry.reused).toBe(true);
    expect(new WorkRepository().listTasks({organisationId:ACME}).filter((task)=>task.title==='One task only')).toHaveLength(1);
  });

  it('rejects retry after the workflow definition changes',()=>{
    const workflows=new WorkflowRepository();
    const definition=workflows.createDefinition({name:'Versioned retry',triggerType:'manual',actions:[{type:'create_email_draft',organisationId:ACME,subject:'Missing account',body:'Fails'}]});
    const run=workflows.run({workflowId:String(definition.id),sourceType:'organisation',sourceId:ACME,triggerEvent:'manual',idempotencyKey:'versioned-parent',context:{organisationId:ACME}});
    workflows.updateDefinition(String(definition.id),{name:'Versioned retry changed'});
    expect(()=>workflows.retryRun(String(run.id))).toThrow('definition changed');
  });
});
