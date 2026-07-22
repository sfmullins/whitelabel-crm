import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { SecurityRepository } from '../infrastructure/database/SecurityRepository';
import { ExtensionRepository } from '../infrastructure/database/ExtensionRepository';
import { ExtensionRuntimeRepository } from '../infrastructure/database/ExtensionRuntimeRepository';
import { LOCAL_OWNER_USER_ID } from '../infrastructure/database/wi8Wi9Schema';

describe('WI11 extension-bound workflow lifecycle',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(()=>cleanupTempDatabase());

  it('forces instantiated workflows off when their source extension is disabled and does not reactivate them automatically',async()=>{
    const owner=new SecurityRepository().resolveLocalUser(LOCAL_OWNER_USER_ID)!;
    const packageInput={manifest:{formatVersion:1 as const,packageKey:'good-order.workflow-pack',name:'Workflow pack',version:'1.0.0',application:{minVersion:'1.0.0'},capabilities:['workflow_templates'],contributions:{customFields:[],customEntities:[],forms:[],views:[],navigation:[],themes:[],reports:[],workflowTemplates:[{key:'review',name:'Review',triggerType:'manual',conditions:{},actions:[{type:'create_task',title:'Review account',priority:'normal'}]}],eventSubscriptions:[],localisations:[],assets:[]}},files:[]};
    const extensions=new ExtensionRepository();const installed=await extensions.install(packageInput,{actorUserId:owner.id,approvedCapabilities:['workflow_templates']}) as any;
    const workflow=new ExtensionRuntimeRepository().instantiateWorkflow(installed.id,'review') as any;
    getSqliteConnection().prepare(`UPDATE workflow_definitions SET enabled=1 WHERE id=?`).run(workflow.id);
    extensions.setEnabled(installed.id,false);
    expect((getSqliteConnection().prepare(`SELECT enabled FROM workflow_definitions WHERE id=?`).get(workflow.id) as {enabled:number}).enabled).toBe(0);
    extensions.setEnabled(installed.id,true);
    expect((getSqliteConnection().prepare(`SELECT enabled FROM workflow_definitions WHERE id=?`).get(workflow.id) as {enabled:number}).enabled).toBe(0);
  });
});
