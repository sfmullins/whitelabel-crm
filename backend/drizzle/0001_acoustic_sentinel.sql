CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`job_title` text,
	`email` text,
	`phone` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`primary_contact_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`summary` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`primary_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`website` text,
	`industry` text,
	`employee_band` text,
	`annual_revenue_band` text,
	`country` text,
	`status` text DEFAULT 'prospect' NOT NULL,
	`source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `contact_organisation_idx` ON `contacts` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `contact_email_idx` ON `contacts` (`email`);--> statement-breakpoint
CREATE INDEX `contact_organisation_primary_idx` ON `contacts` (`organisation_id`,`is_primary`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_one_active_primary_per_org_idx` ON `contacts` (`organisation_id`) WHERE "contacts"."is_primary" = 1 AND "contacts"."status" = 'active' AND "contacts"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX `engagement_organisation_idx` ON `engagements` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `engagement_status_idx` ON `engagements` (`status`);--> statement-breakpoint
CREATE INDEX `engagement_start_date_idx` ON `engagements` (`start_date`);--> statement-breakpoint
CREATE INDEX `organisation_status_idx` ON `organisations` (`status`);--> statement-breakpoint
CREATE INDEX `organisation_name_idx` ON `organisations` (`name`);