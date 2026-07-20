CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`contact_id` text,
	`engagement_id` text,
	`type` text NOT NULL CHECK (`type` in ('note', 'call', 'email', 'meeting', 'message', 'other')),
	`body` text NOT NULL CHECK (length(trim(`body`)) > 0),
	`author` text NOT NULL CHECK (length(trim(`author`)) > 0),
	`occurred_at` text NOT NULL,
	`follow_up_date` text,
	`source` text NOT NULL CHECK (`source` in ('user', 'legacy_import', 'system')),
	`source_reference` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legacy_customer_crm_mappings` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `legacy_organisation_mappings` (
	`source_key` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL CHECK (`source_type` in ('company', 'individual_customer')),
	`organisation_id` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `activity_organisation_occurred_idx` ON `activities` (`organisation_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_contact_idx` ON `activities` (`contact_id`);--> statement-breakpoint
CREATE INDEX `activity_engagement_idx` ON `activities` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `activity_type_idx` ON `activities` (`type`);--> statement-breakpoint
CREATE INDEX `activity_follow_up_idx` ON `activities` (`follow_up_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_source_reference_idx` ON `activities` (`source_reference`) WHERE "activities"."source_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `legacy_customer_mapping_organisation_idx` ON `legacy_customer_crm_mappings` (`organisation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_customer_mapping_contact_idx` ON `legacy_customer_crm_mappings` (`contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_org_mapping_organisation_idx` ON `legacy_organisation_mappings` (`organisation_id`);