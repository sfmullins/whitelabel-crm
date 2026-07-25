import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const Database=require('better-sqlite3');
const args=new Map(process.argv.slice(2).map((value)=>{
  const [key,...rest]=value.split('=');
  return [key,rest.join('=')];
}));
const apiName=String(args.get('--api-name')||'').trim();
const confirmation=String(args.get('--confirm')||'').trim();
const configured=String(args.get('--database')||process.env.CRM_DATABASE_PATH||'backend/data/crm.db');
const databasePath=path.resolve(process.cwd(),configured);

if(!/^[a-z0-9_]+$/.test(apiName)){
  console.error('Provide --api-name=<technical_name>.');
  process.exit(2);
}
if(confirmation!==apiName){
  console.error(`Refusing deletion. Add --confirm=${apiName} exactly.`);
  process.exit(2);
}
if(!fs.existsSync(databasePath)){
  console.error(`Database not found: ${databasePath}`);
  process.exit(2);
}

const database=new Database(databasePath);
database.pragma('foreign_keys = ON');
const definition=database.prepare(`
  SELECT id,name,api_name AS apiName,plural_name AS pluralName
  FROM custom_objects_definition WHERE api_name=?
`).get(apiName);
if(!definition){
  console.log(`No custom object with technical name “${apiName}” exists. Nothing changed.`);
  database.close();
  process.exit(0);
}
const hasTable=(name)=>Boolean(database.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name));
const count=(sql,...values)=>database.prepare(sql).get(...values).count;
const impact={
  records:count(`SELECT count(*) AS count FROM custom_objects_records WHERE object_definition_id=?`,definition.id),
  fields:count(`SELECT count(*) AS count FROM custom_fields_definition WHERE entity_type=?`,apiName),
  relationships:hasTable('custom_object_relationships')
    ?count(`SELECT count(*) AS count FROM custom_object_relationships WHERE source_definition_id=? OR target_definition_id=?`,definition.id,definition.id):0,
};
const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const backupDirectory=path.join(path.dirname(databasePath),'backups');
fs.mkdirSync(backupDirectory,{recursive:true});
const backupPath=path.join(backupDirectory,`before-delete-${apiName}-${stamp}.db`);
database.pragma('wal_checkpoint(TRUNCATE)');
database.close();
fs.copyFileSync(databasePath,backupPath,fs.constants.COPYFILE_EXCL);

const writable=new Database(databasePath);
writable.pragma('foreign_keys = ON');
writable.transaction(()=>{
  writable.prepare(`DELETE FROM custom_fields_definition WHERE entity_type=?`).run(apiName);
  writable.prepare(`DELETE FROM custom_objects_definition WHERE id=?`).run(definition.id);
})();
const integrity=writable.pragma('integrity_check',{simple:true});
writable.close();
if(integrity!=='ok'){
  console.error(`Deletion completed but integrity check returned ${integrity}. Restore ${backupPath} before starting the CRM.`);
  process.exit(1);
}
console.log(JSON.stringify({
  deleted:{name:definition.name,apiName:definition.apiName,...impact},
  backupPath,
  integrity,
},null,2));
