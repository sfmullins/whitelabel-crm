import type Database from 'better-sqlite3';
import { sqlite } from './connection';

export type OwnedEntity='organisation'|'engagement'|'task';
const TABLES:Record<OwnedEntity,string>={organisation:'organisations',engagement:'engagements',task:'tasks'};

export class OwnershipRepository {
  constructor(private readonly connection:Database.Database=sqlite as Database.Database){}

  assignIfMissing(entityType:OwnedEntity,id:string,userId:string,teamId:string|null):void{
    const table=TABLES[entityType];
    this.connection.prepare(`UPDATE ${table} SET owner_user_id=coalesce(owner_user_id,?),owner_team_id=coalesce(owner_team_id,?) WHERE id=?`).run(userId,teamId,id);
  }

  update(entityType:OwnedEntity,id:string,input:{ownerUserId:string;ownerTeamId:string|null}){
    const table=TABLES[entityType];
    const user=this.connection.prepare(`SELECT id FROM users WHERE id=? AND status='active' AND archived_at IS NULL`).get(input.ownerUserId);
    if(!user)throw new Error('Owner user not found or disabled');
    if(input.ownerTeamId){
      const team=this.connection.prepare(`SELECT 1 FROM team_memberships tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=? AND tm.team_id=? AND t.archived_at IS NULL`).get(input.ownerUserId,input.ownerTeamId);
      if(!team)throw new Error('Owner user must belong to the selected team');
    }
    const changed=this.connection.prepare(`UPDATE ${table} SET owner_user_id=?,owner_team_id=? WHERE id=?`).run(input.ownerUserId,input.ownerTeamId,id).changes;
    if(!changed)throw new Error('Owned record not found');
    return this.get(entityType,id);
  }

  get(entityType:OwnedEntity,id:string){
    const table=TABLES[entityType];
    const row=this.connection.prepare(`SELECT r.id,r.owner_user_id,r.owner_team_id,u.display_name AS owner_name,u.email AS owner_email,t.name AS team_name FROM ${table} r LEFT JOIN users u ON u.id=r.owner_user_id LEFT JOIN teams t ON t.id=r.owner_team_id WHERE r.id=?`).get(id) as Record<string,unknown>|undefined;
    if(!row)throw new Error('Owned record not found');
    return {entityType,id:String(row.id),ownerUserId:row.owner_user_id?String(row.owner_user_id):null,ownerName:row.owner_name?String(row.owner_name):null,ownerEmail:row.owner_email?String(row.owner_email):null,ownerTeamId:row.owner_team_id?String(row.owner_team_id):null,ownerTeamName:row.team_name?String(row.team_name):null};
  }
}
