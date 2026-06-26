CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`service_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `custom_fields_definition` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_fields_values` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `custom_fields_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `custom_objects_definition` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_name` text NOT NULL,
	`plural_name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `custom_objects_records` (
	`id` text PRIMARY KEY NOT NULL,
	`object_definition_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`object_definition_id`) REFERENCES `custom_objects_definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `custom_objects_values` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `custom_objects_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_id`) REFERENCES `custom_fields_definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`company` text,
	`email` text NOT NULL,
	`phone` text,
	`mobile` text,
	`address` text,
	`notes` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`service_id` text,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` integer NOT NULL,
	`tax_rate` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`booking_id` text,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`notes` text,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`payment_date` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`duration` integer NOT NULL,
	`price` integer NOT NULL,
	`tax_rate` real NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`logo_url` text,
	`primary_color` text NOT NULL,
	`secondary_color` text NOT NULL,
	`accent_color` text NOT NULL,
	`address` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`website` text NOT NULL,
	`invoice_footer` text,
	`default_tax_rate` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`date_format` text DEFAULT 'YYYY-MM-DD' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booking_customer_idx` ON `bookings` (`customer_id`);--> statement-breakpoint
CREATE INDEX `booking_date_idx` ON `bookings` (`date`);--> statement-breakpoint
CREATE INDEX `cf_def_entity_idx` ON `custom_fields_definition` (`entity_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `cf_def_name_idx` ON `custom_fields_definition` (`entity_type`,`name`);--> statement-breakpoint
CREATE INDEX `cf_val_entity_idx` ON `custom_fields_values` (`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cf_val_unique_idx` ON `custom_fields_values` (`entity_id`,`field_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `co_def_api_idx` ON `custom_objects_definition` (`api_name`);--> statement-breakpoint
CREATE INDEX `co_rec_def_idx` ON `custom_objects_records` (`object_definition_id`);--> statement-breakpoint
CREATE INDEX `co_rec_cust_idx` ON `custom_objects_records` (`customer_id`);--> statement-breakpoint
CREATE INDEX `co_val_rec_idx` ON `custom_objects_values` (`record_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `co_val_unique_idx` ON `custom_objects_values` (`record_id`,`field_id`);--> statement-breakpoint
CREATE INDEX `customer_email_idx` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `customer_name_idx` ON `customers` (`first_name`,`last_name`);--> statement-breakpoint
CREATE INDEX `invoice_item_parent_idx` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_num_idx` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `invoice_customer_idx` ON `invoices` (`customer_id`);--> statement-breakpoint
CREATE INDEX `invoice_booking_idx` ON `invoices` (`booking_id`);--> statement-breakpoint
CREATE INDEX `payment_invoice_idx` ON `payments` (`invoice_id`);