import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getRuntimePaths } from '../../config/runtimePaths';
import { sqlite } from '../../infrastructure/database/connection';
import { ReportingRepository,type ReportFilters,type ReportKey } from '../../infrastructure/database/ReportingRepository';
import { SecurityRepository,type RequestIdentity } from '../../infrastructure/database/SecurityRepository';

interface DueSchedule {
  id:string;
  saved_report_id:string;
  cadence:'daily'|'weekly'|'monthly';
  next_run_at:string;
  report_key:ReportKey;
  filters_json:string;
  owner_user_id:string;
  report_name:string;
}

function parse<T>(value:string,fallback:T):T{try{return JSON.parse(value) as T;}catch{return fallback;}}
function nextOccurrence(value:string,cadence:DueSchedule['cadence']):string{
  const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error('Invalid report schedule timestamp');
  if(cadence==='daily')date.setUTCDate(date.getUTCDate()+1);
  else if(cadence==='weekly')date.setUTCDate(date.getUTCDate()+7);
  else date.setUTCMonth(date.getUTCMonth()+1);
  while(date.getTime()<=Date.now()){if(cadence==='daily')date.setUTCDate(date.getUTCDate()+1);else if(cadence==='weekly')date.setUTCDate(date.getUTCDate()+7);else date.setUTCMonth(date.getUTCMonth()+1);}
  return date.toISOString();
}
function canView(row:{owner_user_id:string;owner_team_id:string|null;visibility:string},identity:RequestIdentity):boolean{return row.owner_user_id===identity.id||row.visibility==='all'||(row.visibility==='team'&&Boolean(row.owner_team_id&&identity.teams.some((team)=>team.id===row.owner_team_id)))||identity.roles.some((role)=>role.key==='owner'||role.key==='administrator');}

export class ScheduledReportService {
  private timer:NodeJS.Timeout|null=null;
  private running=false;

  constructor(
    private readonly connection:Database.Database=sqlite as Database.Database,
    private readonly reporting=new ReportingRepository(connection),
    private readonly security=new SecurityRepository(connection),
    private readonly intervalMs=60_000,
  ){}

  start():void{if(this.timer)return;void this.processDue();this.timer=setInterval(()=>void this.processDue(),this.intervalMs);this.timer.unref?.();}
  stop():void{if(this.timer)clearInterval(this.timer);this.timer=null;}

  async processDue(limit=25):Promise<{succeeded:number;failed:number}> {
    if(this.running)return {succeeded:0,failed:0};this.running=true;let succeeded=0;let failed=0;
    try{
      const outputDirectory=this.outputDirectory();this.recoverStaleRuns();fs.mkdirSync(outputDirectory,{recursive:true});
      const schedules=this.connection.prepare(`SELECT s.id,s.saved_report_id,s.cadence,s.next_run_at,r.report_key,r.filters_json,r.owner_user_id,r.name AS report_name FROM report_schedules s JOIN saved_reports r ON r.id=s.saved_report_id WHERE s.enabled=1 AND s.next_run_at<=? AND r.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM report_schedule_runs rr WHERE rr.schedule_id=s.id AND rr.status='running') ORDER BY s.next_run_at LIMIT ?`).all(new Date().toISOString(),Math.max(1,Math.min(100,limit))) as DueSchedule[];
      for(const schedule of schedules){
        const runId=crypto.randomUUID();const startedAt=new Date().toISOString();
        this.connection.prepare(`INSERT INTO report_schedule_runs(id,schedule_id,saved_report_id,report_key,status,started_at) VALUES(?,?,?,?, 'running',?)`).run(runId,schedule.id,schedule.saved_report_id,schedule.report_key,startedAt);
        try{
          const exported=this.reporting.exportCsv(schedule.report_key,parse<ReportFilters>(schedule.filters_json,{}));const filename=`${runId}-${exported.filename}`;const finalPath=path.join(outputDirectory,filename);const temporaryPath=`${finalPath}.tmp`;
          fs.writeFileSync(temporaryPath,exported.content,{encoding:'utf8',mode:0o600});fs.renameSync(temporaryPath,finalPath);const completedAt=new Date().toISOString();const expiresAt=new Date(Date.now()+90*24*60*60*1000).toISOString();
          this.connection.transaction(()=>{
            this.connection.prepare(`UPDATE report_schedule_runs SET status='succeeded',filename=?,storage_path=?,byte_size=?,completed_at=?,expires_at=? WHERE id=?`).run(exported.filename,finalPath,Buffer.byteLength(exported.content),completedAt,expiresAt,runId);
            this.connection.prepare(`UPDATE report_schedules SET last_run_at=?,next_run_at=?,updated_at=? WHERE id=?`).run(completedAt,nextOccurrence(schedule.next_run_at,schedule.cadence),completedAt,schedule.id);
          })();
          try{this.security.recordAudit({actorUserId:schedule.owner_user_id,action:'report.schedule.generated',entityType:'saved_report',entityId:schedule.saved_report_id,requestId:`schedule:${runId}`,route:'/scheduled-report-runner',method:'SYSTEM',metadata:{scheduleId:schedule.id,runId,reportKey:schedule.report_key,filename:exported.filename}});}catch(error){console.error('Scheduled report audit write failed:',error);}
          succeeded+=1;
        }catch(error){const completedAt=new Date().toISOString();const message=error instanceof Error?error.message:String(error);this.connection.transaction(()=>{this.connection.prepare(`UPDATE report_schedule_runs SET status='failed',error_summary=?,completed_at=? WHERE id=?`).run(message.slice(0,2000),completedAt,runId);this.connection.prepare(`UPDATE report_schedules SET last_run_at=?,next_run_at=?,updated_at=? WHERE id=?`).run(completedAt,nextOccurrence(schedule.next_run_at,schedule.cadence),completedAt,schedule.id);})();failed+=1;}
      }
      this.removeExpiredArtifacts();return {succeeded,failed};
    }finally{this.running=false;}
  }

  listRuns(identity:RequestIdentity,limit=100){
    const rows=this.connection.prepare(`SELECT rr.*,r.name AS report_name,r.owner_user_id,r.owner_team_id,r.visibility FROM report_schedule_runs rr JOIN saved_reports r ON r.id=rr.saved_report_id ORDER BY rr.started_at DESC LIMIT ?`).all(Math.max(1,Math.min(500,limit))) as Array<Record<string,unknown>>;
    return rows.filter((row)=>canView({owner_user_id:String(row.owner_user_id),owner_team_id:row.owner_team_id?String(row.owner_team_id):null,visibility:String(row.visibility)},identity)).map((row)=>({id:row.id,scheduleId:row.schedule_id,savedReportId:row.saved_report_id,reportName:row.report_name,reportKey:row.report_key,status:row.status,filename:row.filename,byteSize:row.byte_size,errorSummary:row.error_summary,startedAt:row.started_at,completedAt:row.completed_at,expiresAt:row.expires_at,downloadAvailable:row.status==='succeeded'&&Boolean(row.storage_path)&&fs.existsSync(String(row.storage_path))}));
  }

  getDownload(identity:RequestIdentity,id:string):{path:string;filename:string}{
    const row=this.connection.prepare(`SELECT rr.storage_path,rr.filename,rr.status,r.owner_user_id,r.owner_team_id,r.visibility FROM report_schedule_runs rr JOIN saved_reports r ON r.id=rr.saved_report_id WHERE rr.id=?`).get(id) as {storage_path:string|null;filename:string|null;status:string;owner_user_id:string;owner_team_id:string|null;visibility:string}|undefined;
    if(!row||!canView(row,identity))throw new Error('Scheduled report run not found');if(row.status!=='succeeded'||!row.storage_path||!row.filename||!fs.existsSync(row.storage_path))throw new Error('Scheduled report download is unavailable');return {path:row.storage_path,filename:row.filename};
  }

  private outputDirectory():string{return path.join(getRuntimePaths().dataDirectory,'scheduled-reports');}
  private recoverStaleRuns():void{const cutoff=new Date(Date.now()-30*60*1000).toISOString();this.connection.prepare(`UPDATE report_schedule_runs SET status='failed',error_summary='Execution interrupted before completion',completed_at=? WHERE status='running' AND started_at<?`).run(new Date().toISOString(),cutoff);}
  private removeExpiredArtifacts():void{const rows=this.connection.prepare(`SELECT id,storage_path FROM report_schedule_runs WHERE status='succeeded' AND expires_at IS NOT NULL AND expires_at<?`).all(new Date().toISOString()) as Array<{id:string;storage_path:string|null}>;for(const row of rows){if(row.storage_path)try{fs.rmSync(row.storage_path,{force:true});}catch{/* retained for next cleanup */}this.connection.prepare(`UPDATE report_schedule_runs SET storage_path=NULL WHERE id=?`).run(row.id);}}
}
