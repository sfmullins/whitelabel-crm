import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase,openDatabase,sqlite } from '../backend/src/infrastructure/database/connection';
import { configureRuntimePaths } from '../backend/src/config/runtimePaths';
import { runMigrations } from '../backend/src/infrastructure/database/migrate';
import { runSeed } from '../backend/src/infrastructure/database/seed';
import { SecurityRepository } from '../backend/src/infrastructure/database/SecurityRepository';
import { ExtensionRepository } from '../backend/src/infrastructure/database/ExtensionRepository';
import { CustomFieldRepository } from '../backend/src/infrastructure/database/repositories/CustomFieldRepository';

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whitelabel-crm-wi11-'));const databasePath=path.join(temp,'wi11.sqlite');
  configureRuntimePaths({dataDirectory:temp,databasePath,internalBackupDirectory:path.join(temp,'backups'),temporaryDirectory:path.join(temp,'tmp'),logDirectory:path.join(temp,'logs'),documentDirectory:path.join(temp,'documents')});
  try{
    const database=openDatabase(databasePath);runMigrations(database,path.resolve('drizzle'),sqlite);await runSeed();runMigrations(database,path.resolve('drizzle'),sqlite);
    const security=new SecurityRepository(sqlite);const owner=security.resolveLocalUser();if(!owner||!owner.permissions.includes('extensions.manage'))throw new Error('WI11 extension permissions were not bootstrapped');
    const repository=new ExtensionRepository(sqlite);const packageInput={manifest:{formatVersion:1,packageKey:'good-order.smoke-extension',name:'Good Order smoke extension',version:'1.0.0',application:{minVersion:'1.0.0'},capabilities:['custom_fields','themes'],contributions:{customFields:[{entityType:'organisation',key:'smoke_code',label:'Smoke code',type:'text',options:[],required:false}],customEntities:[],forms:[],views:[],navigation:[],themes:[{key:'smoke',label:'Smoke theme',tokens:{accent:'#123456'}}],reports:[],workflowTemplates:[],eventSubscriptions:[],localisations:[],assets:[]}}};
    const installed=await repository.install(packageInput,{actorUserId:owner.id,approvedCapabilities:['custom_fields','themes']}) as any;if(installed.status!=='enabled'||!installed.backupFilename)throw new Error('WI11 extension install or pre-migration backup failed');
    const field=(await new CustomFieldRepository().getDefinitions('organisation')).find((item)=>item.name==='good_order_smoke_extension__smoke_code');if(!field)throw new Error('WI11 namespaced custom field was not applied');
    repository.setEnabled(installed.id,false);if((await new CustomFieldRepository().getDefinitions('organisation')).some((item)=>item.id===field.id))throw new Error('WI11 disabled contribution remained visible');
    repository.setEnabled(installed.id,true);if(!(await new CustomFieldRepository().getDefinitions('organisation')).some((item)=>item.id===field.id))throw new Error('WI11 re-enabled contribution remained hidden');
    const exported=repository.exportExtension(installed.id) as any;if(exported.extension.packageKey!=='good-order.smoke-extension'||!exported.migrations.length)throw new Error('WI11 extension export is incomplete');
    if(sqlite.pragma('integrity_check',{simple:true})!=='ok')throw new Error('WI11 SQLite integrity check failed');
    console.log('WI11 declarative extension lifecycle smoke passed.');
  }finally{closeDatabase();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
