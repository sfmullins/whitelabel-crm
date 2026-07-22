import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';
import type { ReminderDelivery } from '../../application/services/ReminderScheduler';

const now=()=>new Date().toISOString();

export class NotificationRepository {
  constructor(private readonly connection:Database.Database=sqlite as Database.Database){}

  enqueueReminder(reminder:ReminderDelivery){
    const timestamp=now();
    const task=reminder.sourceType==='task'?this.connection.prepare('SELECT title,description FROM tasks WHERE id=?').get(reminder.sourceId) as {title:string;description:string|null}|undefined:undefined;
    const title=task?.title??`Reminder: ${reminder.sourceType.replace(/_/g,' ')}`;
    const body=task?.description??`A ${reminder.sourceType.replace(/_/g,' ')} reminder is due.`;
    const route=reminder.sourceType==='task'?`/work?taskId=${encodeURIComponent(reminder.sourceId)}`:reminder.organisationId?`/organisations/${encodeURIComponent(reminder.organisationId)}`:'/work';
    this.connection.prepare(`INSERT INTO in_app_notifications(id,reminder_id,organisation_id,title,body,route,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'unread',?,?) ON CONFLICT(reminder_id) DO NOTHING`).run(randomUUID(),reminder.id,reminder.organisationId,title,body,route,timestamp,timestamp);
    return this.getByReminder(reminder.id);
  }

  getByReminder(reminderId:string){const row=this.connection.prepare('SELECT * FROM in_app_notifications WHERE reminder_id=?').get(reminderId) as Record<string,unknown>|undefined;return row?this.map(row):null;}
  list(status:'unread'|'dismissed'='unread',limit=100){return (this.connection.prepare('SELECT * FROM in_app_notifications WHERE status=? ORDER BY created_at DESC LIMIT ?').all(status,limit) as Array<Record<string,unknown>>).map((row)=>this.map(row));}
  dismiss(id:string){const timestamp=now();const result=this.connection.prepare(`UPDATE in_app_notifications SET status='dismissed',dismissed_at=?,updated_at=? WHERE id=? AND status='unread'`).run(timestamp,timestamp,id);if(!result.changes)throw new Error('Unread notification not found');return this.connection.prepare('SELECT * FROM in_app_notifications WHERE id=?').get(id);}

  private map(row:Record<string,unknown>){return {id:row.id,reminderId:row.reminder_id,organisationId:row.organisation_id,title:row.title,body:row.body,route:row.route,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,dismissedAt:row.dismissed_at};}
}
