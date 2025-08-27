CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`role` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`alias` text NOT NULL,
	`size` integer,
	`downloaded` integer DEFAULT false,
	`created_at` integer
);
