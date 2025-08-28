CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`duration` integer,
	`created_at` integer
);
