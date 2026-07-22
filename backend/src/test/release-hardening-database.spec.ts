import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getSqliteConnection } from '../infrastructure/database/connection';

const EMAIL_ACCOUNT='20000000-0000-4000-8000-000000000029';
const CALENDAR='20000000-0000-4000-8000-000000000033';

describe('release hardening lifecycle cleanup',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('removes reconciliation records when their local source is deleted',()=>{
    const connection=getSqliteConnection();const now=new Date().toISOString();
    connection.prepare(`INSERT INTO email_drafts(id,account_id,to_json,cc_json,bcc_json,subject,body_text,status,created_at,updated_at) VALUES('draft-cleanup',?,'[]','[]','[]','Cleanup','Body','draft',?,?)`).run(EMAIL_ACCOUNT,now,now);
    connection.prepare(`INSERT INTO outbound_reconciliation_records(id,kind,source_id,operation,payload_json,status,created_at,updated_at) VALUES('email-reconciliation','email','draft-cleanup','send','{}','pending',?,?)`).run(now,now);
    connection.prepare(`INSERT INTO calendar_write_operations(id,calendar_id,operation,status,request_json,started_at) VALUES('calendar-operation',?,'create','running','{}',?)`).run(CALENDAR,now);
    connection.prepare(`INSERT INTO outbound_reconciliation_records(id,kind,source_id,operation,payload_json,status,created_at,updated_at) VALUES('calendar-reconciliation','calendar','calendar-operation','create','{}','pending',?,?)`).run(now,now);
    connection.prepare('DELETE FROM email_drafts WHERE id=?').run('draft-cleanup');
    connection.prepare('DELETE FROM calendar_write_operations WHERE id=?').run('calendar-operation');
    expect((connection.prepare('SELECT count(*) AS count FROM outbound_reconciliation_records').get() as {count:number}).count).toBe(0);
  });
});
