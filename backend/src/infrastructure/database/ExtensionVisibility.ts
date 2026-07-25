import type Database from 'better-sqlite3';
import { AppError } from '../../application/errors';

function registryAvailable(connection:Database.Database):boolean{return Boolean(connection.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='extension_bindings'`).get());}
export const LEGACY_CUSTOMISATIONS_PACKAGE_KEY='legacy-customisations';

export interface ExtensionResourceOwner {
  extensionId:string;
  packageKey:string;
  systemManaged:boolean;
  contributionType:string;
  contributionKey:string;
}

export function getExtensionResourceOwner(connection:Database.Database,resourceType:string,resourceId:string):ExtensionResourceOwner|null {
  if(!registryAvailable(connection))return null;
  const row=connection.prepare(`
    SELECT e.id AS extensionId,e.package_key AS packageKey,e.system_managed AS systemManaged,
      b.contribution_type AS contributionType,b.contribution_key AS contributionKey
    FROM extension_bindings b
    JOIN extensions e ON e.id=b.extension_id
    WHERE b.resource_type=? AND b.resource_id=?
  `).get(resourceType,resourceId) as {
    extensionId:string;packageKey:string;systemManaged:number;contributionType:string;contributionKey:string;
  }|undefined;
  return row?{...row,systemManaged:Boolean(row.systemManaged)}:null;
}

export function isExtensionResourceEnabled(connection:Database.Database,resourceType:string,resourceId:string):boolean {
  if(!registryAvailable(connection))return true;
  const row=connection.prepare(`SELECT e.status,b.disabled_at,b.retired_at FROM extension_bindings b JOIN extensions e ON e.id=b.extension_id WHERE b.resource_type=? AND b.resource_id=?`).get(resourceType,resourceId) as {status:string;disabled_at:string|null;retired_at:string|null}|undefined;
  return !row||(row.status==='enabled'&&!row.disabled_at&&!row.retired_at);
}

export function assertResourceNotExtensionOwned(connection:Database.Database,resourceType:string,resourceId:string):void {
  const owner=getExtensionResourceOwner(connection,resourceType,resourceId);
  if(!owner||owner.packageKey===LEGACY_CUSTOMISATIONS_PACKAGE_KEY)return;
  throw new AppError(
    409,
    `This resource is supplied by extension package ${owner.packageKey}. Disable or manage that package from Extensions.`,
    'EXTENSION_RESOURCE_MANAGED',
    {packageKey:owner.packageKey,managePath:'/extensions'},
  );
}

export function releaseLegacyResourceBinding(connection:Database.Database,resourceType:string,resourceId:string):void {
  const owner=getExtensionResourceOwner(connection,resourceType,resourceId);
  if(!owner||owner.packageKey!==LEGACY_CUSTOMISATIONS_PACKAGE_KEY)return;
  connection.prepare(`DELETE FROM extension_bindings WHERE extension_id=? AND resource_type=? AND resource_id=?`)
    .run(owner.extensionId,resourceType,resourceId);
  connection.prepare(`DELETE FROM extension_contributions WHERE extension_id=? AND contribution_type=? AND contribution_key=?`)
    .run(owner.extensionId,owner.contributionType,owner.contributionKey);
}
