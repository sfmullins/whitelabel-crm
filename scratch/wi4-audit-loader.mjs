import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const partsDir = 'scratch/wi4-audit.parts';
const encoded = fs.readdirSync(partsDir)
  .filter((name) => name.endsWith('.b64'))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8').trim())
  .join('');
const payload = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}
function replaceRequired(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(replacement)) return;
  if (!source.includes(search)) {
    throw new Error(`Required WI4 audit target missing in ${filePath}: ${search.slice(0, 160)}`);
  }
  fs.writeFileSync(filePath, source.replace(search, replacement));
}
function replaceAllRequired(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(replacement) && !source.includes(search)) return;
  if (!source.includes(search)) {
    throw new Error(`Required repeated WI4 audit target missing in ${filePath}: ${search.slice(0, 160)}`);
  }
  fs.writeFileSync(filePath, source.split(search).join(replacement));
}
function appendOnce(filePath, marker, content) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(marker)) return;
  fs.writeFileSync(filePath, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

for (const [filePath, content] of Object.entries(payload.files)) write(filePath, content);

// Saved-view contracts must preserve every scoped filter and a timeline organisation.
replaceRequired(
  'shared/src/types.ts',
  `    engagementId: z.string().uuid().optional(),
    type: ActivityTypeSchema.optional(),
  }).strict(),`,
  `    engagementId: z.string().uuid().optional(),
    type: ActivityTypeSchema.optional(),
    from: IsoDateOnlySchema.optional(),
    to: IsoDateOnlySchema.optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to cannot precede from' });
    }
  }),`,
);
replaceRequired(
  'shared/src/types.ts',
  `  filters: z.object({
    eventTypes: z.array(TimelineEventTypeSchema).optional(),
    contactId: z.string().uuid().optional(),`,
  `  filters: z.object({
    organisationId: z.string().uuid(),
    eventTypes: z.array(TimelineEventTypeSchema).optional(),
    contactId: z.string().uuid().optional(),`,
);
replaceRequired(
  'shared/src/types.ts',
  `    activityType: ActivityTypeSchema.optional(),
    followUpStatus: TimelineFollowUpStatusSchema.optional(),
  }).strict(),`,
  `    activityType: ActivityTypeSchema.optional(),
    followUpStatus: TimelineFollowUpStatusSchema.optional(),
    from: IsoTimestampSchema.optional(),
    to: IsoTimestampSchema.optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to cannot precede from' });
    }
  }),`,
);

// Command-palette pinned views must reopen the actual filter definition.
replaceRequired(
  'frontend/src/components/layouts/MainLayout.tsx',
  `buildQueryString, formatEntityLabel, groupSearchResults, readRecentRecords, rememberRecentRecord`,
  `buildQueryString, formatEntityLabel, groupSearchResults, readRecentRecords, rememberRecentRecord, savedViewRoute`,
);
replaceRequired(
  'frontend/src/components/layouts/MainLayout.tsx',
  `const direct = [{ title: 'Create organisation', route: '/organisations' }, { title: 'Open follow-up queue', route: '/follow-ups' }, { title: 'Browse contacts', route: '/contacts' }];`,
  `const direct = [
    { title: 'Create organisation', route: '/organisations?action=create' },
    { title: 'Create contact', route: '/organisations?intent=create-contact' },
    { title: 'Log activity', route: '/organisations?intent=log-activity' },
    { title: 'Open follow-up queue', route: '/follow-ups' },
  ];`,
);
replaceRequired(
  'frontend/src/components/layouts/MainLayout.tsx',
  `onClick={() => navigate(view.context === 'organisations' ? '/organisations' : view.context === 'followups' ? '/follow-ups' : '/search')}`,
  `onClick={() => navigate(savedViewRoute(view))}`,
);

// Search projection contains parent context and refreshes when related records change.
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  `trim(coalesce(c.email, '') || ' ' || coalesce(c.phone, '')),
        '/organisations/' || c.organisation_id || '?tab=contacts&contactId=' || c.id,
        c.updated_at,
        c.archived_at
      from contacts c`,
  `trim(coalesce(c.email, '') || ' ' || coalesce(c.phone, '') || ' ' || o.name),
        '/organisations/' || c.organisation_id || '?tab=contacts&contactId=' || c.id,
        c.updated_at,
        c.archived_at
      from contacts c
      join organisations o on o.id = c.organisation_id`,
);
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  `e.type || ' · ' || e.status,
        coalesce(e.summary, ''),
        '/organisations/' || e.organisation_id || '?tab=engagements&engagementId=' || e.id,
        e.updated_at,
        e.archived_at
      from engagements e`,
  `e.type || ' · ' || e.status,
        trim(coalesce(e.summary, '') || ' ' || o.name),
        '/organisations/' || e.organisation_id || '?tab=engagements&engagementId=' || e.id,
        e.updated_at,
        e.archived_at
      from engagements e
      join organisations o on o.id = e.organisation_id`,
);
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  `a.author || ' · ' || substr(a.occurred_at, 1, 10),
        a.body,
        '/organisations/' || a.organisation_id || '?tab=timeline&activityId=' || a.id,
        a.updated_at,
        a.archived_at
      from activities a`,
  `a.author || ' · ' || substr(a.occurred_at, 1, 10),
        trim(
          a.body || ' ' || o.name || ' ' ||
          coalesce(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') || ' ' ||
          coalesce(e.name, '')
        ),
        '/organisations/' || a.organisation_id || '?tab=timeline&activityId=' || a.id,
        a.updated_at,
        a.archived_at
      from activities a
      join organisations o on o.id = a.organisation_id
      left join contacts c on c.id = a.contact_id
      left join engagements e on e.id = a.engagement_id`,
);
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  `coalesce(i.notes, ''),
        '/invoices?invoiceId=' || i.id,
        i.updated_at,
        null
      from invoices i
      join customers c on c.id = i.customer_id
      left join legacy_customer_crm_mappings m on m.customer_id = i.customer_id`,
  `trim(coalesce(i.notes, '') || ' ' || coalesce(o.name, '')),
        '/invoices?invoiceId=' || i.id,
        i.updated_at,
        null
      from invoices i
      join customers c on c.id = i.customer_id
      left join legacy_customer_crm_mappings m on m.customer_id = i.customer_id
      left join organisations o on o.id = m.organisation_id`,
);
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  `          p.created_at,
          p.created_at,
          'Payment received',`,
  `          p.payment_date,
          p.created_at,
          'Payment received',`,
);
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  `normalizedName: input.name.trim().toLocaleLowerCase('en'),`,
  `normalizedName: input.name.trim().normalize('NFKC').replace(/\\s+/g, ' ').toLocaleLowerCase('en'),`,
);
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  `normalizedName: name.toLocaleLowerCase('en'),`,
  `normalizedName: name.normalize('NFKC').replace(/\\s+/g, ' ').toLocaleLowerCase('en'),`,
);

// Tighten the unmerged structural migration and contextual trigger behavior.
replaceRequired(
  'backend/drizzle/0003_needy_carmella_unuscione.sql',
  `\t\`updated_at\` text NOT NULL
);`,
  `\t\`updated_at\` text NOT NULL,
\tCONSTRAINT \`saved_view_context_check\` CHECK(\`context\` in ('organisations','followups','search','timeline')),
\tCONSTRAINT \`saved_view_name_check\` CHECK(length(trim(\`name\`)) > 0),
\tCONSTRAINT \`saved_view_definition_check\` CHECK(json_valid(\`definition_json\`))
);`,
);
replaceRequired(
  'backend/drizzle/0003_needy_carmella_unuscione.sql',
  `\t\`archived_at\` text
);`,
  `\t\`archived_at\` text,
\tCONSTRAINT \`search_document_type_check\` CHECK(\`entity_type\` in ('organisation','contact','engagement','activity','customer','invoice')),
\tCONSTRAINT \`search_document_title_check\` CHECK(length(trim(\`title\`)) > 0),
\tCONSTRAINT \`search_document_route_check\` CHECK(length(trim(\`route\`)) > 0)
);`,
);
replaceAllRequired(
  'backend/drizzle/0003_needy_carmella_unuscione.sql',
  `trim(coalesce(new.email, '') || ' ' || coalesce(new.phone, '')),
    '/organisations/' || new.organisation_id || '?tab=contacts&contactId=' || new.id,`,
  `trim(coalesce(new.email, '') || ' ' || coalesce(new.phone, '') || ' ' || coalesce((select name from organisations where id = new.organisation_id), '')),
    '/organisations/' || new.organisation_id || '?tab=contacts&contactId=' || new.id,`,
);
replaceAllRequired(
  'backend/drizzle/0003_needy_carmella_unuscione.sql',
  `new.type || ' · ' || new.status, coalesce(new.summary, ''),
    '/organisations/' || new.organisation_id || '?tab=engagements&engagementId=' || new.id,`,
  `new.type || ' · ' || new.status,
    trim(coalesce(new.summary, '') || ' ' || coalesce((select name from organisations where id = new.organisation_id), '')),
    '/organisations/' || new.organisation_id || '?tab=engagements&engagementId=' || new.id,`,
);
replaceAllRequired(
  'backend/drizzle/0003_needy_carmella_unuscione.sql',
  `new.body, '/organisations/' || new.organisation_id || '?tab=timeline&activityId=' || new.id,`,
  `trim(
      new.body || ' ' || coalesce((select name from organisations where id = new.organisation_id), '') || ' ' ||
      coalesce((select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from contacts where id = new.contact_id), '') || ' ' ||
      coalesce((select name from engagements where id = new.engagement_id), '')
    ),
    '/organisations/' || new.organisation_id || '?tab=timeline&activityId=' || new.id,`,
);
replaceAllRequired(
  'backend/drizzle/0003_needy_carmella_unuscione.sql',
  `coalesce(new.notes, ''), '/invoices?invoiceId=' || new.id, new.updated_at, null`,
  `trim(
      coalesce(new.notes, '') || ' ' ||
      coalesce((
        select o.name
        from legacy_customer_crm_mappings m
        join organisations o on o.id = m.organisation_id
        where m.customer_id = new.customer_id
      ), '')
    ),
    '/invoices?invoiceId=' || new.id, new.updated_at, null`,
);
appendOnce(
  'backend/drizzle/0003_needy_carmella_unuscione.sql',
  'WI4_CONTEXT_REFRESH_TRIGGERS',
  `
--> statement-breakpoint
-- WI4_CONTEXT_REFRESH_TRIGGERS
CREATE TRIGGER wi4_activity_follow_up_completion_insert
BEFORE INSERT ON activities
WHEN new.follow_up_completed_at IS NOT NULL AND new.follow_up_date IS NULL
BEGIN
  SELECT RAISE(ABORT, 'follow_up_completed_at requires follow_up_date');
END;
--> statement-breakpoint
CREATE TRIGGER wi4_activity_follow_up_completion_update
BEFORE UPDATE OF follow_up_completed_at, follow_up_date ON activities
WHEN new.follow_up_completed_at IS NOT NULL AND new.follow_up_date IS NULL
BEGIN
  SELECT RAISE(ABORT, 'follow_up_completed_at requires follow_up_date');
END;
--> statement-breakpoint
CREATE TRIGGER wi4_organisation_context_refresh
AFTER UPDATE OF name ON organisations
BEGIN
  UPDATE contacts SET updated_at = updated_at WHERE organisation_id = new.id;
  UPDATE engagements SET updated_at = updated_at WHERE organisation_id = new.id;
  UPDATE activities SET updated_at = updated_at WHERE organisation_id = new.id;
  UPDATE invoices
  SET updated_at = updated_at
  WHERE customer_id IN (
    SELECT customer_id FROM legacy_customer_crm_mappings WHERE organisation_id = new.id
  );
END;
--> statement-breakpoint
CREATE TRIGGER wi4_contact_context_refresh
AFTER UPDATE OF first_name, last_name, email, phone, job_title ON contacts
BEGIN
  UPDATE activities SET updated_at = updated_at WHERE contact_id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_engagement_context_refresh
AFTER UPDATE OF name, summary, type, status ON engagements
BEGIN
  UPDATE activities SET updated_at = updated_at WHERE engagement_id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_mapping_context_insert
AFTER INSERT ON legacy_customer_crm_mappings
BEGIN
  UPDATE customers SET updated_at = updated_at WHERE id = new.customer_id;
  UPDATE invoices SET updated_at = updated_at WHERE customer_id = new.customer_id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_mapping_context_update
AFTER UPDATE OF organisation_id, contact_id ON legacy_customer_crm_mappings
BEGIN
  UPDATE customers SET updated_at = updated_at WHERE id = new.customer_id;
  UPDATE invoices SET updated_at = updated_at WHERE customer_id = new.customer_id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_mapping_context_delete
AFTER DELETE ON legacy_customer_crm_mappings
BEGIN
  UPDATE customers SET updated_at = updated_at WHERE id = old.customer_id;
  UPDATE invoices SET updated_at = updated_at WHERE customer_id = old.customer_id;
END;
`,
);

// Development seed identifiers are stable across resets.
replaceRequired(
  'backend/src/infrastructure/database/seed.ts',
  `import crypto from 'node:crypto';\n`,
  ``,
);
replaceRequired(
  'backend/src/infrastructure/database/seed.ts',
  `  acmeService: '20000000-0000-4000-8000-000000000010',
  northstarOrganisation:`,
  `  acmeService: '20000000-0000-4000-8000-000000000010',
  acmeMeetingActivity: '20000000-0000-4000-8000-000000000011',
  acmeOverdueActivity: '20000000-0000-4000-8000-000000000012',
  acmeTodayActivity: '20000000-0000-4000-8000-000000000013',
  acmeUpcomingActivity: '20000000-0000-4000-8000-000000000014',
  acmeCompletedActivity: '20000000-0000-4000-8000-000000000015',
  acmeNoteActivity: '20000000-0000-4000-8000-000000000016',
  acmeInvoiceItem: '20000000-0000-4000-8000-000000000017',
  northstarOrganisation:`,
);
const activityIds = [
  'IDS.acmeMeetingActivity',
  'IDS.acmeOverdueActivity',
  'IDS.acmeTodayActivity',
  'IDS.acmeUpcomingActivity',
  'IDS.acmeCompletedActivity',
  'IDS.acmeNoteActivity',
];
for (const id of activityIds) {
  replaceRequired(
    'backend/src/infrastructure/database/seed.ts',
    `id: crypto.randomUUID(), organisationId: IDS.acmeOrganisation`,
    `id: ${id}, organisationId: IDS.acmeOrganisation`,
  );
}
replaceRequired(
  'backend/src/infrastructure/database/seed.ts',
  `id: crypto.randomUUID(),
      invoiceId: IDS.acmeInvoice,`,
  `id: IDS.acmeInvoiceItem,
      invoiceId: IDS.acmeInvoice,`,
);

// Extend frontend helper tests with pinned-view restoration.
replaceRequired(
  'frontend/src/lib/wi4.test.ts',
  `import { buildQueryString, groupSearchResults } from './wi4';`,
  `import { buildQueryString, groupSearchResults, savedViewRoute } from './wi4';`,
);
appendOnce(
  'frontend/src/lib/wi4.test.ts',
  `restores pinned saved-view routes`,
  `
describe('saved-view routes', () => {
  it('restores pinned saved-view routes with their filters', () => {
    expect(savedViewRoute({
      id: '50000000-0000-4000-8000-000000000001',
      context: 'timeline',
      name: 'Acme calls',
      definition: {
        version: 1,
        context: 'timeline',
        filters: {
          organisationId: '20000000-0000-4000-8000-000000000001',
          eventTypes: ['activity'],
          activityType: 'call',
        },
        sort: 'occurred_desc',
      },
      isPinned: true,
      createdAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
    })).toBe('/organisations/20000000-0000-4000-8000-000000000001?tab=timeline&eventTypes=activity&activityType=call');
  });
});
`,
);

// Extend repository tests for contextual refresh, constraints and payment dates.
replaceRequired(
  'backend/src/test/wi4-workspace.spec.ts',
  `  });
});`,
  `  });

  it('refreshes contextual search fields and legacy mappings', async () => {
    const repository = new WorkspaceRepository(sqlite);
    const contactId = '50000000-0000-4000-8000-000000000002';
    const engagementId = '50000000-0000-4000-8000-000000000003';
    const activityId = '50000000-0000-4000-8000-000000000004';
    const now = new Date().toISOString();

    sqlite.prepare(\`insert into contacts (
      id, organisation_id, first_name, last_name, job_title, email, phone, is_primary,
      status, created_at, updated_at, archived_at
    ) values (?, ?, 'Context', 'Person', 'Advisor', null, null, 0, 'active', ?, ?, null)\`)
      .run(contactId, ACME, now, now);
    sqlite.prepare(\`insert into engagements (
      id, organisation_id, primary_contact_id, name, type, status, summary, start_date,
      end_date, created_at, updated_at, archived_at
    ) values (?, ?, ?, 'Context Engagement', 'other', 'active', null, '2026-07-20',
      null, ?, ?, null)\`).run(engagementId, ACME, contactId, now, now);
    sqlite.prepare(\`insert into activities (
      id, organisation_id, contact_id, engagement_id, type, body, author, occurred_at,
      follow_up_date, follow_up_completed_at, source, source_reference, created_at,
      updated_at, archived_at
    ) values (?, ?, ?, ?, 'note', 'Context-only note', 'Local user', ?, null, null,
      'user', null, ?, ?, null)\`).run(activityId, ACME, contactId, engagementId, now, now, now);

    expect((await repository.search({ q: 'Acme Context', includeArchived: false, limit: 30, offset: 0 }))
      .items.some((item) => item.entityId === activityId)).toBe(true);

    sqlite.prepare(\`update organisations set name = 'Acme Renewed Ltd', updated_at = ? where id = ?\`).run(now, ACME);
    expect((await repository.search({ q: 'Acme Renewed Context', includeArchived: false, limit: 30, offset: 0 }))
      .items.some((item) => item.entityId === activityId)).toBe(true);
  });

  it('enforces WI4 database constraints and uses payment_date in the timeline', async () => {
    const timestamp = new Date().toISOString();
    expect(() => sqlite.prepare(\`insert into saved_views (
      id, context, name, normalized_name, definition_json, is_pinned, created_at, updated_at
    ) values (?, 'invalid', 'Bad', 'bad', '{}', 0, ?, ?)\`)
      .run('50000000-0000-4000-8000-000000000010', timestamp, timestamp))
      .toThrow();

    const completed = sqlite.prepare(\`select id from activities where follow_up_completed_at is not null limit 1\`)
      .get() as { id: string };
    expect(() => sqlite.prepare(\`update activities
      set follow_up_date = null, follow_up_completed_at = ? where id = ?\`)
      .run(timestamp, completed.id)).toThrow();

    const payment = sqlite.prepare(\`select payment_date from payments where id = '20000000-0000-4000-8000-000000000009'\`)
      .get() as { payment_date: string };
    const repository = new WorkspaceRepository(sqlite);
    const timeline = await repository.listTimeline(ACME, { eventTypes: ['payment'], limit: 10, offset: 0 });
    expect(timeline.items[0]?.occurredAt).toBe(payment.payment_date);
  });
});`,
);

console.log(`Applied WI4 SOW audit replacements to ${Object.keys(payload.files).length} complete files.`);
