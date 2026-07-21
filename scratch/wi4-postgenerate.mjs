import fs from 'node:fs';
import path from 'node:path';

const drizzleDir = path.resolve('backend/drizzle');
const migration = fs.readdirSync(drizzleDir)
  .filter((name) => /^0003_.*\.sql$/.test(name))
  .sort()
  .at(-1);

if (!migration) {
  throw new Error('Expected drizzle-kit to generate a 0003 WI4 migration');
}

const migrationPath = path.join(drizzleDir, migration);
let sql = fs.readFileSync(migrationPath, 'utf8');
if (sql.includes('-- WI4_FTS5_PROJECTION')) {
  console.log(`WI4 FTS5 projection already present in ${migration}`);
  process.exit(0);
}

sql += `
--> statement-breakpoint
-- WI4_FTS5_PROJECTION
CREATE VIRTUAL TABLE search_documents_fts USING fts5(
  title,
  subtitle,
  body,
  content='search_documents',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER search_documents_ai AFTER INSERT ON search_documents BEGIN
  INSERT INTO search_documents_fts(rowid, title, subtitle, body)
  VALUES (new.rowid, new.title, new.subtitle, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER search_documents_ad AFTER DELETE ON search_documents BEGIN
  INSERT INTO search_documents_fts(search_documents_fts, rowid, title, subtitle, body)
  VALUES ('delete', old.rowid, old.title, old.subtitle, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents BEGIN
  INSERT INTO search_documents_fts(search_documents_fts, rowid, title, subtitle, body)
  VALUES ('delete', old.rowid, old.title, old.subtitle, old.body);
  INSERT INTO search_documents_fts(rowid, title, subtitle, body)
  VALUES (new.rowid, new.title, new.subtitle, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER wi4_organisations_search_ai AFTER INSERT ON organisations BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'organisation:' || new.id, 'organisation', new.id, new.id, new.name,
    trim(coalesce(new.industry, '') || case when new.country is not null then ' · ' || new.country else '' end),
    trim(coalesce(new.legal_name, '') || ' ' || coalesce(new.website, '') || ' ' || coalesce(new.source, '')),
    '/organisations/' || new.id, new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_organisations_search_au AFTER UPDATE ON organisations BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'organisation:' || new.id, 'organisation', new.id, new.id, new.name,
    trim(coalesce(new.industry, '') || case when new.country is not null then ' · ' || new.country else '' end),
    trim(coalesce(new.legal_name, '') || ' ' || coalesce(new.website, '') || ' ' || coalesce(new.source, '')),
    '/organisations/' || new.id, new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_organisations_search_ad AFTER DELETE ON organisations BEGIN
  DELETE FROM search_documents WHERE entity_type = 'organisation' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_contacts_search_ai AFTER INSERT ON contacts BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'contact:' || new.id, 'contact', new.id, new.organisation_id,
    trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')),
    trim(coalesce(new.job_title, '') || case when new.email is not null then ' · ' || new.email else '' end),
    trim(coalesce(new.email, '') || ' ' || coalesce(new.phone, '')),
    '/organisations/' || new.organisation_id || '?tab=contacts&contactId=' || new.id,
    new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_contacts_search_au AFTER UPDATE ON contacts BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'contact:' || new.id, 'contact', new.id, new.organisation_id,
    trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')),
    trim(coalesce(new.job_title, '') || case when new.email is not null then ' · ' || new.email else '' end),
    trim(coalesce(new.email, '') || ' ' || coalesce(new.phone, '')),
    '/organisations/' || new.organisation_id || '?tab=contacts&contactId=' || new.id,
    new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_contacts_search_ad AFTER DELETE ON contacts BEGIN
  DELETE FROM search_documents WHERE entity_type = 'contact' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_engagements_search_ai AFTER INSERT ON engagements BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'engagement:' || new.id, 'engagement', new.id, new.organisation_id, new.name,
    new.type || ' · ' || new.status, coalesce(new.summary, ''),
    '/organisations/' || new.organisation_id || '?tab=engagements&engagementId=' || new.id,
    new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_engagements_search_au AFTER UPDATE ON engagements BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'engagement:' || new.id, 'engagement', new.id, new.organisation_id, new.name,
    new.type || ' · ' || new.status, coalesce(new.summary, ''),
    '/organisations/' || new.organisation_id || '?tab=engagements&engagementId=' || new.id,
    new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_engagements_search_ad AFTER DELETE ON engagements BEGIN
  DELETE FROM search_documents WHERE entity_type = 'engagement' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_activities_search_ai AFTER INSERT ON activities BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'activity:' || new.id, 'activity', new.id, new.organisation_id,
    upper(substr(new.type, 1, 1)) || substr(new.type, 2), new.author || ' · ' || substr(new.occurred_at, 1, 10),
    new.body, '/organisations/' || new.organisation_id || '?tab=timeline&activityId=' || new.id,
    new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_activities_search_au AFTER UPDATE ON activities BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'activity:' || new.id, 'activity', new.id, new.organisation_id,
    upper(substr(new.type, 1, 1)) || substr(new.type, 2), new.author || ' · ' || substr(new.occurred_at, 1, 10),
    new.body, '/organisations/' || new.organisation_id || '?tab=timeline&activityId=' || new.id,
    new.updated_at, new.archived_at
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_activities_search_ad AFTER DELETE ON activities BEGIN
  DELETE FROM search_documents WHERE entity_type = 'activity' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_customers_search_ai AFTER INSERT ON customers BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'customer:' || new.id, 'customer', new.id,
    (select organisation_id from legacy_customer_crm_mappings where customer_id = new.id),
    trim(new.first_name || ' ' || new.last_name),
    trim(coalesce(new.company, '') || case when new.email <> '' then ' · ' || new.email else '' end),
    trim(new.email || ' ' || coalesce(new.phone, '') || ' ' || coalesce(new.mobile, '') || ' ' || coalesce(new.address, '')),
    '/customers/' || new.id, new.updated_at, null
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_customers_search_au AFTER UPDATE ON customers BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'customer:' || new.id, 'customer', new.id,
    (select organisation_id from legacy_customer_crm_mappings where customer_id = new.id),
    trim(new.first_name || ' ' || new.last_name),
    trim(coalesce(new.company, '') || case when new.email <> '' then ' · ' || new.email else '' end),
    trim(new.email || ' ' || coalesce(new.phone, '') || ' ' || coalesce(new.mobile, '') || ' ' || coalesce(new.address, '')),
    '/customers/' || new.id, new.updated_at, null
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_customers_search_ad AFTER DELETE ON customers BEGIN
  DELETE FROM search_documents WHERE entity_type = 'customer' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_invoices_search_ai AFTER INSERT ON invoices BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'invoice:' || new.id, 'invoice', new.id,
    (select organisation_id from legacy_customer_crm_mappings where customer_id = new.customer_id),
    new.invoice_number,
    upper(new.status) || ' · ' || (select trim(first_name || ' ' || last_name) from customers where id = new.customer_id),
    coalesce(new.notes, ''), '/invoices?invoiceId=' || new.id, new.updated_at, null
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_invoices_search_au AFTER UPDATE ON invoices BEGIN
  INSERT INTO search_documents (id, entity_type, entity_id, organisation_id, title, subtitle, body, route, updated_at, archived_at)
  VALUES (
    'invoice:' || new.id, 'invoice', new.id,
    (select organisation_id from legacy_customer_crm_mappings where customer_id = new.customer_id),
    new.invoice_number,
    upper(new.status) || ' · ' || (select trim(first_name || ' ' || last_name) from customers where id = new.customer_id),
    coalesce(new.notes, ''), '/invoices?invoiceId=' || new.id, new.updated_at, null
  )
  ON CONFLICT(entity_type, entity_id) DO UPDATE SET
    organisation_id = excluded.organisation_id, title = excluded.title, subtitle = excluded.subtitle,
    body = excluded.body, route = excluded.route, updated_at = excluded.updated_at, archived_at = excluded.archived_at;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_invoices_search_ad AFTER DELETE ON invoices BEGIN
  DELETE FROM search_documents WHERE entity_type = 'invoice' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER wi4_mapping_search_ai AFTER INSERT ON legacy_customer_crm_mappings BEGIN
  UPDATE search_documents SET organisation_id = new.organisation_id
  WHERE (entity_type = 'customer' AND entity_id = new.customer_id)
     OR (entity_type = 'invoice' AND entity_id in (select id from invoices where customer_id = new.customer_id));
END;
`;

fs.writeFileSync(migrationPath, sql);
console.log(`Appended WI4 FTS5 projection and synchronisation triggers to ${migration}`);
