CREATE TABLE `relay_quota` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relay_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relay_telemetry` (
	`session_id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `relay_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
