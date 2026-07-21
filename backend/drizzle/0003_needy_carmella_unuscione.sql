CREATE TABLE `saved_views` (
	`id` text PRIMARY KEY NOT NULL,
	`context` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`definition_json` text NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `saved_view_context_check` CHECK(`context` in ('organisations','followups','search','timeline')),
	CONSTRAINT `saved_view_name_check` CHECK(length(trim(`name`)) > 0),
	CONSTRAINT `saved_view_definition_check` CHECK(json_valid(`definition_json`))
);
--> statement-breakpoint
CREATE TABLE `search_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`organisation_id` text,
	`title` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`route` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	CONSTRAINT `search_document_type_check` CHECK(`entity_type` in ('organisation','contact','engagement','activity','customer','invoice')),
	CONSTRAINT `search_document_title_check` CHECK(length(trim(`title`)) > 0),
	CONSTRAINT `search_document_route_check` CHECK(length(trim(`route`)) > 0)
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `follow_up_completed_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `saved_view_context_name_idx` ON `saved_views` (`context`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `saved_view_context_pinned_idx` ON `saved_views` (`context`,`is_pinned`);--> statement-breakpoint
CREATE UNIQUE INDEX `search_document_entity_idx` ON `search_documents` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `search_document_organisation_idx` ON `search_documents` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `search_document_updated_idx` ON `search_documents` (`updated_at`);--> statement-breakpoint
CREATE INDEX `activity_follow_up_completed_idx` ON `activities` (`follow_up_completed_at`);
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
    coalesce(nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), ''), nullif(trim(coalesce(new.email, '')), ''), 'Unnamed contact'),
    trim(coalesce(new.job_title, '') || case when new.email is not null then ' · ' || new.email else '' end),
    trim(coalesce(new.email, '') || ' ' || coalesce(new.phone, '') || ' ' || coalesce((select name from organisations where id = new.organisation_id), '')),
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
    coalesce(nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), ''), nullif(trim(coalesce(new.email, '')), ''), 'Unnamed contact'),
    trim(coalesce(new.job_title, '') || case when new.email is not null then ' · ' || new.email else '' end),
    trim(coalesce(new.email, '') || ' ' || coalesce(new.phone, '') || ' ' || coalesce((select name from organisations where id = new.organisation_id), '')),
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
    new.type || ' · ' || new.status,
    trim(coalesce(new.summary, '') || ' ' || coalesce((select name from organisations where id = new.organisation_id), '')),
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
    new.type || ' · ' || new.status,
    trim(coalesce(new.summary, '') || ' ' || coalesce((select name from organisations where id = new.organisation_id), '')),
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
    trim(
      new.body || ' ' || coalesce((select name from organisations where id = new.organisation_id), '') || ' ' ||
      coalesce((select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from contacts where id = new.contact_id), '') || ' ' ||
      coalesce((select name from engagements where id = new.engagement_id), '')
    ),
    '/organisations/' || new.organisation_id || '?tab=timeline&activityId=' || new.id,
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
    trim(
      new.body || ' ' || coalesce((select name from organisations where id = new.organisation_id), '') || ' ' ||
      coalesce((select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from contacts where id = new.contact_id), '') || ' ' ||
      coalesce((select name from engagements where id = new.engagement_id), '')
    ),
    '/organisations/' || new.organisation_id || '?tab=timeline&activityId=' || new.id,
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
    trim(
      coalesce(new.notes, '') || ' ' ||
      coalesce((
        select o.name
        from legacy_customer_crm_mappings m
        join organisations o on o.id = m.organisation_id
        where m.customer_id = new.customer_id
      ), '')
    ),
    '/invoices?invoiceId=' || new.id, new.updated_at, null
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
    trim(
      coalesce(new.notes, '') || ' ' ||
      coalesce((
        select o.name
        from legacy_customer_crm_mappings m
        join organisations o on o.id = m.organisation_id
        where m.customer_id = new.customer_id
      ), '')
    ),
    '/invoices?invoiceId=' || new.id, new.updated_at, null
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
