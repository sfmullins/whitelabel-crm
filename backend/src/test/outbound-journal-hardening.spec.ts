import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getRuntimePaths } from '../config/runtimePaths';
import { getSqliteConnection } from '../infrastructure/database/connection';
import { CredentialVault } from '../infrastructure/security/CredentialVault';
import { CommunicationsHubRepository } from '../infrastructure/database/CommunicationsHubRepository';
import { CommunicationsHubService } from '../application/services/CommunicationsHubService';
import type { ConnectedAccountConfig } from '../infrastructure/integrations/ConnectedAdapters';
import type { EmailSendAdapter,OutboundEmail } from '../infrastructure/integrations/OutboundAdapters';

const ACME='20000000-0000-4000-8000-000000000001';
const EMAIL_ACCOUNT='20000000-0000-4000-8000-000000000029';

class InspectingFailureSender implements EmailSendAdapter {
  journalPresent=false;
  draftSending=false;
  async send(_config:ConnectedAccountConfig,_secret:Record<string,string>,_message:OutboundEmail):Promise<never>{
    const connection=getSqliteConnection();
    this.journalPresent=Boolean(connection.prepare("SELECT 1 AS present FROM outbound_reconciliation_records WHERE kind='email' AND status='pending'").get());
    this.draftSending=Boolean(connection.prepare("SELECT 1 AS present FROM email_drafts WHERE status='sending'").get());
    throw new Error('SMTP authentication failed before transmission');
  }
}

describe('outbound journal hardening',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('persists the journal and sending state before invoking SMTP',async()=>{
    const connection=getSqliteConnection();
    connection.prepare(`UPDATE communication_accounts SET enabled=1,settings_json=? WHERE id=?`).run(JSON.stringify({smtpUrl:'smtps://mail.example',fromAddress:'consultant@goodorder.example'}),EMAIL_ACCOUNT);
    const vault=new CredentialVault(path.join(getRuntimePaths().dataDirectory,'outbound-journal-vault'));
    vault.store('fixture-email-key',{password:'secret'});
    const repository=new CommunicationsHubRepository();
    const sender=new InspectingFailureSender();
    const service=new CommunicationsHubService(repository,vault,sender);
    const draft=service.createDraft({accountId:EMAIL_ACCOUNT,organisationId:ACME,to:[{address:'client@example.test'}],subject:'Journal ordering',bodyText:'Test'});

    await expect(service.sendDraft(String(draft.id),true)).rejects.toThrow('authentication failed');
    expect(sender.journalPresent).toBe(true);
    expect(sender.draftSending).toBe(true);
    expect(repository.getDraft(String(draft.id))?.status).toBe('failed');
    expect((connection.prepare('SELECT count(*) AS count FROM outbound_reconciliation_records').get() as {count:number}).count).toBe(0);
  });
});
