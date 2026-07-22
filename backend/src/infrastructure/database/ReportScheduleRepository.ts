import type Database from 'better-sqlite3';
import { sqlite } from './connection';
import type { RequestIdentity } from './SecurityRepository';

function administrator(identity:RequestIdentity):boolean{return identity.roles.some((role)=>role.key==='owner'||role.key==='administrator');}

export class ReportScheduleRepository {
  constructor(private readonly connection:Database.Database=sqlite as Database.Database){}

  update(identity:RequestIdentity,id:string,input:{cadence?:'daily'|'weekly'|'monthly';enabled?:boolean;nextRunAt?:string}){
    const row=this.connection.prepare(`SELECT s.*,r.owner_user_id FROM report_schedules s JOIN saved_reports r ON r.id=s.saved_report_id WHERE s.id=? AND r.archived_at IS NULL`).get(id) as Record<string,unknown>|undefined;
    if(!row||String(row.owner_user_id)!==identity.id&&!administrator(identity))throw new Error('Report schedule not found');
    const timestamp=new Date().toISOString();
    this.connection.prepare(`UPDATE report_schedules SET cadence=?,enabled=?,next_run_at=?,updated_at=? WHERE id=?`).run(input.cadence??row.cadence,input.enabled===undefined?row.enabled:input.enabled?1:0,input.nextRunAt??row.next_run_at,timestamp,id);
    return this.connection.prepare(`SELECT s.*,r.name AS report_name FROM report_schedules s JOIN saved_reports r ON r.id=s.saved_report_id WHERE s.id=?`).get(id);
  }
}
