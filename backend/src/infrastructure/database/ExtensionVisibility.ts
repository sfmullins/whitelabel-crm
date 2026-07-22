import type Database from 'better-sqlite3';

function registryAvailable(connection:Database.Database):boolean{return Boolean(connection.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='extension_bindings'`).get());}

export function isExtensionResourceEnabled(connection:Database.Database,resourceType:string,resourceId:string):boolean {
  if(!registryAvailable(connection))return true;
  const row=connection.prepare(`SELECT e.status,b.disabled_at FROM extension_bindings b JOIN extensions e ON e.id=b.extension_id WHERE b.resource_type=? AND b.resource_id=?`).get(resourceType,resourceId) as {status:string;disabled_at:string|null}|undefined;
  return !row||(row.status==='enabled'&&!row.disabled_at);
}

export function assertResourceNotExtensionOwned(connection:Database.Database,resourceType:string,resourceId:string):void {
  if(!registryAvailable(connection))return;
  const row=connection.prepare(`SELECT e.package_key FROM extension_bindings b JOIN extensions e ON e.id=b.extension_id WHERE b.resource_type=? AND b.resource_id=?`).get(resourceType,resourceId) as {package_key:string}|undefined;
  if(row)throw new Error(`Resource is managed by extension package ${row.package_key} and cannot be deleted directly`);
}
