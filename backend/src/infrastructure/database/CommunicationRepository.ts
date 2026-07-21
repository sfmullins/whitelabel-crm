import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { sqlite } from './connection';

export type CommunicationChannel = 'email' | 'meeting' | 'phone' | 'sms' | 'whatsapp' | 'teams' | 'slack' | 'voip' | 'other';

export interface CommunicationInput {
  organisationId: string;
  contactId?: string | null;
  engagementId?: string | null;
  channel: CommunicationChannel;
  direction?: 'inbound' | 'outbound' | 'internal';
  subject?: string | null;
  body: string;
  occurredAt: string;
  externalId?: string | null;
  threadKey?: string | null;
  status?: 'logged' | 'matched' | 'unmatched' | 'ignored' | 'draft' | 'sent' | 'failed';
}

const timestamp = () => new Date().toISOString();

function mapCommunication(row: Record<string, unknown>) {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    contactId: row.contact_id,
    engagementId: row.engagement_id,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    body: row.body,
    occurredAt: row.occurred_at,
    externalId: row.external_id,
    threadKey: row.thread_key,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export class CommunicationRepository {
  constructor(private readonly connection: Database.Database = sqlite as Database.Database) {}

  create(input: CommunicationInput) {
    const organisation = this.connection.prepare('SELECT id FROM organisations WHERE id=? AND archived_at IS NULL').get(input.organisationId);
    if (!organisation) throw new Error('Organisation not found or archived');
    const id = randomUUID();
    const now = timestamp();
    this.connection.prepare(`
      INSERT INTO communications(id,organisation_id,contact_id,engagement_id,channel,direction,subject,body,occurred_at,
        external_id,thread_key,status,created_at,updated_at,archived_at)
      VALUES(@id,@organisationId,@contactId,@engagementId,@channel,@direction,@subject,@body,@occurredAt,
        @externalId,@threadKey,@status,@now,@now,NULL)
    `).run({
      id,
      organisationId: input.organisationId,
      contactId: input.contactId ?? null,
      engagementId: input.engagementId ?? null,
      channel: input.channel,
      direction: input.direction ?? 'internal',
      subject: input.subject?.trim() || null,
      body: input.body.trim(),
      occurredAt: input.occurredAt,
      externalId: input.externalId ?? null,
      threadKey: input.threadKey ?? null,
      status: input.status ?? 'logged',
      now,
    });
    return this.getById(id)!;
  }

  getById(id: string) {
    const row = this.connection.prepare(`
      SELECT c.*,o.name AS organisation_name FROM communications c JOIN organisations o ON o.id=c.organisation_id WHERE c.id=?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? mapCommunication(row) : null;
  }

  list(input: { organisationId?: string; channel?: string; status?: string; includeArchived?: boolean; limit?: number } = {}) {
    const rows = this.connection.prepare(`
      SELECT c.*,o.name AS organisation_name FROM communications c JOIN organisations o ON o.id=c.organisation_id
      WHERE (@organisationId IS NULL OR c.organisation_id=@organisationId)
        AND (@channel IS NULL OR c.channel=@channel)
        AND (@status IS NULL OR c.status=@status)
        AND (@includeArchived=1 OR c.archived_at IS NULL)
      ORDER BY c.occurred_at DESC LIMIT @limit
    `).all({ organisationId: input.organisationId ?? null, channel: input.channel ?? null, status: input.status ?? null,
      includeArchived: input.includeArchived ? 1 : 0, limit: input.limit ?? 200 }) as Array<Record<string, unknown>>;
    return rows.map(mapCommunication);
  }

  updateStatus(id: string,status: 'logged'|'matched'|'unmatched'|'ignored'|'draft'|'sent'|'failed') {
    const result = this.connection.prepare('UPDATE communications SET status=?,updated_at=? WHERE id=?').run(status,timestamp(),id);
    if (!result.changes) throw new Error('Communication not found');
    return this.getById(id)!;
  }

  archive(id: string) {
    const now = timestamp();
    const result = this.connection.prepare('UPDATE communications SET archived_at=coalesce(archived_at,?),updated_at=? WHERE id=?').run(now,now,id);
    if (!result.changes) throw new Error('Communication not found');
    return this.getById(id)!;
  }
}
