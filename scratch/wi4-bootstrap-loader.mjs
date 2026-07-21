import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const partsDir = 'scratch/wi4-bootstrap.parts';
const encoded = fs.readdirSync(partsDir).filter((name) => name.endsWith('.b64')).sort().map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8').trim()).join('');
const payload = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}
function replaceRequired(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(replacement)) return;
  if (!source.includes(search)) throw new Error(`Required patch target not found in ${filePath}: ${search.slice(0, 100)}`);
  fs.writeFileSync(filePath, source.replace(search, replacement));
}
function appendOnce(filePath, marker, content) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(marker)) return;
  fs.writeFileSync(filePath, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

for (const [filePath, content] of Object.entries(payload.files)) write(filePath, content);

replaceRequired(
  'shared/src/types.ts',
  `  followUpDate: IsoDateOnlySchema.nullable(),\n  source: ActivitySourceSchema,`,
  `  followUpDate: IsoDateOnlySchema.nullable(),\n  followUpCompletedAt: IsoTimestampSchema.nullable(),\n  source: ActivitySourceSchema,`,
);
appendOnce('shared/src/types.ts', 'WI4 CRM workspace, search, timeline and saved views', payload.sharedAppend);

replaceRequired(
  'backend/src/application/interfaces/IRepositories.ts',
  `  update(id: string, patch: ActivityUpdate): Promise<Activity | null>;\n  archive(id: string, archivedAt: string): Promise<Activity | null>;`,
  `  update(id: string, patch: ActivityUpdate): Promise<Activity | null>;\n  completeFollowUp(id: string, completedAt: string): Promise<Activity | null>;\n  reopenFollowUp(id: string, updatedAt: string): Promise<Activity | null>;\n  archive(id: string, archivedAt: string): Promise<Activity | null>;`,
);
appendOnce('backend/src/application/interfaces/IRepositories.ts', 'export interface IWorkspaceRepository', payload.irepoAppend);

replaceRequired(
  'backend/src/infrastructure/database/schema.ts',
  `  followUpDate: text('follow_up_date'),\n  source: text('source').notNull(),`,
  `  followUpDate: text('follow_up_date'),\n  followUpCompletedAt: text('follow_up_completed_at'),\n  source: text('source').notNull(),`,
);
replaceRequired(
  'backend/src/infrastructure/database/schema.ts',
  `  followUpIdx: index('activity_follow_up_idx').on(table.followUpDate),\n  sourceReferenceIdx:`,
  `  followUpIdx: index('activity_follow_up_idx').on(table.followUpDate),\n  followUpCompletedIdx: index('activity_follow_up_completed_idx').on(table.followUpCompletedAt),\n  sourceReferenceIdx:`,
);
appendOnce('backend/src/infrastructure/database/schema.ts', 'WI4 search projection and saved views', `
// ==========================================\n// WI4 search projection and saved views\n// ==========================================\nexport const searchDocuments = sqliteTable('search_documents', {\n  id: text('id').primaryKey(),\n  entityType: text('entity_type').notNull(),\n  entityId: text('entity_id').notNull(),\n  organisationId: text('organisation_id'),\n  title: text('title').notNull(),\n  subtitle: text('subtitle').notNull().default(''),\n  body: text('body').notNull().default(''),\n  route: text('route').notNull(),\n  updatedAt: text('updated_at').notNull(),\n  archivedAt: text('archived_at'),\n}, (table) => ({\n  entityIdx: uniqueIndex('search_document_entity_idx').on(table.entityType, table.entityId),\n  organisationIdx: index('search_document_organisation_idx').on(table.organisationId),\n  updatedIdx: index('search_document_updated_idx').on(table.updatedAt),\n  typeCheck: check('search_document_type_check', sql\`\${table.entityType} in ('organisation', 'contact', 'engagement', 'activity', 'customer', 'invoice')\`),\n}));\n\nexport const savedViews = sqliteTable('saved_views', {\n  id: text('id').primaryKey(),\n  context: text('context').notNull(),\n  name: text('name').notNull(),\n  normalizedName: text('normalized_name').notNull(),\n  definitionJson: text('definition_json').notNull(),\n  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),\n  createdAt: text('created_at').notNull(),\n  updatedAt: text('updated_at').notNull(),\n}, (table) => ({\n  contextNameIdx: uniqueIndex('saved_view_context_name_idx').on(table.context, table.normalizedName),\n  contextPinnedIdx: index('saved_view_context_pinned_idx').on(table.context, table.isPinned),\n  contextCheck: check('saved_view_context_check', sql\`\${table.context} in ('organisations', 'followups', 'search', 'timeline')\`),\n}));\n`);

replaceRequired(
  'backend/src/infrastructure/database/migrate.ts',
  `import { runWi3LegacyActivityBackfill } from './wi3LegacyActivityBackfill';`,
  `import { runWi3LegacyActivityBackfill } from './wi3LegacyActivityBackfill';\nimport { rebuildSearchIndex } from './WorkspaceRepository';`,
);
replaceRequired(
  'backend/src/infrastructure/database/migrate.ts',
  `  runWi3LegacyActivityBackfill(sqliteConnection);`,
  `  runWi3LegacyActivityBackfill(sqliteConnection);\n  rebuildSearchIndex(sqliteConnection);`,
);

replaceRequired(
  'backend/src/presentation/app.ts',
  `import activitiesRouter from './routes/activities';`,
  `import activitiesRouter from './routes/activities';\nimport workspaceRouter from './routes/workspace';`,
);
replaceRequired(
  'backend/src/presentation/app.ts',
  `app.use('/api', activitiesRouter);`,
  `app.use('/api', activitiesRouter);\napp.use('/api', workspaceRouter);`,
);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.scripts['wi4:smoke'] = 'npm exec -w backend -- tsx ../scratch/wi4-smoke.ts';
packageJson.scripts['ci:verify'] = 'npm run build && npm test && npm run db:smoke && npm run wi4:smoke && npm run desktop:preflight';
fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

appendOnce('README.md', '## WI4 CRM workspace', `
## WI4 CRM workspace\n\nThe development workspace is organisation-first. Global search uses the local SQLite FTS5 index, the organisation workspace consolidates contacts, engagements and a unified timeline, and activity follow-up dates drive the operational follow-up queue.\n\nReset and seed the prelaunch development database with Good Order Ltd and Acme Ltd:\n\n\`\`\`bash\nnpm run db:migrate\nnpm run db:seed\n\`\`\`\n\nNo external search or hosted workflow service is required. WI4 adds no runtime dependency and remains within the repository's FOSS licence gates.\n`);
appendOnce('docs/ARCHITECTURE.md', '## WI4 organisation-first workspace', `
## WI4 organisation-first workspace\n\nWI4 adds an organisation-first application layer above the WI2/WI3 CRM domain. Express workspace routes call \`WorkspaceService\`, which depends on \`IWorkspaceRepository\`; the SQLite implementation owns organisation directory projections, unified timeline queries, follow-up queues, saved views and operational dashboard calculations.\n\n\`search_documents\` is a normalized projection of organisations, contacts, engagements, activities, legacy customers and invoices. A content-linked SQLite FTS5 virtual table indexes title, subtitle and body. Domain-table triggers keep the projection synchronized, and migration startup performs a deterministic rebuild after the WI3 compatibility backfill. Search is local-only and no external search service is used.\n\n\`\`\`mermaid\nflowchart LR\n  React[React CRM/search UI] --> Express[Express routes]\n  Express --> Services[Workspace/application services]\n  Services --> Interfaces[Repository interfaces]\n  Interfaces --> SQLite[(SQLite domain tables)]\n  SQLite --> Projection[search_documents]\n  Projection --> FTS[SQLite FTS5]\n\`\`\`\n\nSaved views persist versioned, schema-validated filter definitions rather than executable SQL. Follow-up completion is stored on the source activity using \`follow_up_completed_at\`; completion never archives the activity. The organisation timeline unions activity, engagement, booking, invoice and payment events in a stable backend-defined order.\n`);
appendOnce('docs/DOMAIN.md', '## WI4 workspace concepts', `
## WI4 workspace concepts\n\n- **Search document:** a local derived projection used by SQLite FTS5. It is not a new source of truth.\n- **Saved view:** a local single-user, versioned and context-specific filter definition. Built-in views remain code-defined.\n- **Follow-up:** an activity with a due date. It is open while \`follow_up_completed_at\` is null, can be completed or reopened, and remains part of immutable interaction history.\n- **Unified timeline event:** a typed projection of activities, engagements and mapped legacy booking/financial records for one organisation. Legacy foreign keys are not rewritten.\n\nDevelopment data is intentionally resettable before launch. The deterministic seed identifies Good Order Ltd and Stephen Mullins without invented personal contact data and uses Acme Ltd as the principal demonstration account.\n`);

console.log(`WI4 bootstrap applied ${Object.keys(payload.files).length} complete files plus schema and contract patches.`);
