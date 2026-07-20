import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { LegacyCustomerMappingRepository } from './LegacyCustomerMappingRepository';

export type LegacyNoteSegment = {
  ordinal: number;
  rawSegment: string;
  body: string;
  occurredAt: string;
};

function validIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function parseLegacyCustomerNotes(
  notes: string,
  fallbackOccurredAt: string,
): LegacyNoteSegment[] {
  // Match all supported line endings directly so parsing never mutates the source
  // segment used for body preservation and SHA-256 idempotency.
  const marker = /\[Note logged on ([^\]\r\n]+)\]:[ \t]*(?:\r\n|\r|\n)/g;
  const matches = Array.from(notes.matchAll(marker));
  const pending: Array<{ rawSegment: string; body: string; occurredAt: string }> = [];

  const addFallback = (rawSegment: string) => {
    const body = rawSegment.trim();
    if (body) pending.push({ rawSegment, body, occurredAt: fallbackOccurredAt });
  };

  if (matches.length === 0) {
    addFallback(notes);
  } else {
    addFallback(notes.slice(0, matches[0].index ?? 0));

    matches.forEach((match, index) => {
      const start = match.index ?? 0;
      const bodyStart = start + match[0].length;
      const end = index + 1 < matches.length
        ? matches[index + 1].index ?? notes.length
        : notes.length;
      const rawSegment = notes.slice(start, end);
      const rawTimestamp = match[1].trim();
      const parsedTimestamp = validIsoOrNull(rawTimestamp);
      const bodyText = notes.slice(bodyStart, end).trim();

      if (!bodyText) {
        addFallback(rawSegment);
        return;
      }

      pending.push({
        rawSegment,
        body: parsedTimestamp
          ? bodyText
          : `Legacy timestamp: ${rawTimestamp}\n\n${bodyText}`,
        occurredAt: parsedTimestamp ?? fallbackOccurredAt,
      });
    });
  }

  return pending.map((segment, ordinal) => ({ ...segment, ordinal }));
}

function hasWi3Tables(connection: Database.Database): boolean {
  const required = ['activities', 'legacy_organisation_mappings', 'legacy_customer_crm_mappings'];
  const rows = connection.prepare(`
    select name
    from sqlite_master
    where type = 'table' and name in ('activities', 'legacy_organisation_mappings', 'legacy_customer_crm_mappings')
  `).all() as Array<{ name: string }>;
  return required.every((name) => rows.some((row) => row.name === name));
}

export function runWi3LegacyActivityBackfill(connection: Database.Database): void {
  if (!hasWi3Tables(connection)) return;

  const customers = connection.prepare(`
    select id, notes, created_at, updated_at
    from customers
    order by id asc
  `).all() as Array<{
    id: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const mappingRepository = new LegacyCustomerMappingRepository(connection);
  const importedActivityExists = connection.prepare(`
    select 1
    from activities
    where source_reference = ?
    limit 1
  `);
  const insertImportedActivity = connection.prepare(`
    insert into activities (
      id, organisation_id, contact_id, engagement_id,
      type, body, author, occurred_at, follow_up_date,
      source, source_reference, created_at, updated_at, archived_at
    ) values (
      @id, @organisationId, @contactId, null,
      'note', @body, 'Legacy import', @occurredAt, null,
      'legacy_import', @sourceReference, @now, @now, null
    )
  `);

  for (const customer of customers) {
    try {
      connection.transaction(() => {
        const mapping = mappingRepository.ensureCustomerMapping(customer.id);
        if (!mapping) {
          throw new Error(`Legacy customer ${customer.id} disappeared during WI3 backfill`);
        }

        if (!customer.notes || customer.notes.trim() === '') return;

        const importTimestamp = new Date().toISOString();
        const fallbackOccurredAt =
          validIsoOrNull(customer.updated_at)
          ?? validIsoOrNull(customer.created_at)
          ?? importTimestamp;
        const segments = parseLegacyCustomerNotes(customer.notes, fallbackOccurredAt);

        for (const segment of segments) {
          const digest = createHash('sha256').update(segment.rawSegment).digest('hex');
          const sourceReference =
            `legacy-customer-note:${customer.id}:${segment.ordinal}:${digest}`;
          if (importedActivityExists.get(sourceReference)) continue;

          const now = new Date().toISOString();
          insertImportedActivity.run({
            id: randomUUID(),
            organisationId: mapping.organisationId,
            contactId: mapping.contactId,
            body: segment.body.trim(),
            occurredAt: segment.occurredAt,
            sourceReference,
            now,
          });
        }
      })();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`WI3 legacy activity backfill failed for customer ${customer.id}: ${detail}`);
    }
  }
}
