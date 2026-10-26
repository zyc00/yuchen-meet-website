CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`cap_hash` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_request_key_unique` ON `bookings` (`request_key`);--> statement-breakpoint
CREATE INDEX `booking_intervals` ON `bookings` (`start`,`end`,`status`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
