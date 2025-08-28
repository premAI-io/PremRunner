// Embedded migrations for executable deployment
// This file is auto-generated from the drizzle migration files
// Run: bun scripts/embed-migrations.ts to update

export const migrations = [
  {
    sql: "CREATE TABLE `messages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`content` text NOT NULL,\n\t`role` text NOT NULL,\n\t`model` text NOT NULL,\n\t`created_at` integer\n);\n--> statement-breakpoint\nCREATE TABLE `models` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`alias` text NOT NULL,\n\t`size` integer,\n\t`downloaded` integer DEFAULT false,\n\t`created_at` integer\n);\n--> statement-breakpoint\nCREATE TABLE `traces` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`input` text NOT NULL,\n\t`output` text NOT NULL,\n\t`model` text NOT NULL,\n\t`prompt_tokens` integer,\n\t`completion_tokens` integer,\n\t`total_tokens` integer,\n\t`duration` integer,\n\t`created_at` integer\n);\n",
    bps: [],
    folderMillis: 1756347071725,
    hash: "0000_old_goliath_hash",
  },
];

export const journal = {
  version: "7",
  dialect: "sqlite",
  entries: [
    {
      idx: 0,
      version: "6",
      when: 1756347071652,
      tag: "0000_old_goliath",
      breakpoints: true,
    },
  ],
};
