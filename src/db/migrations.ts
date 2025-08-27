// Embedded migrations for executable deployment
// This file is auto-generated from the drizzle migration files
// Run: bun scripts/embed-migrations.ts to update

export const migrations = [
  {
    sql: "CREATE TABLE `messages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`content` text NOT NULL,\n\t`role` text NOT NULL,\n\t`model` text NOT NULL,\n\t`created_at` integer\n);\n--> statement-breakpoint\nCREATE TABLE `models` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`alias` text NOT NULL,\n\t`size` integer,\n\t`downloaded` integer DEFAULT false,\n\t`created_at` integer\n);\n",
    bps: [],
    folderMillis: 1756332540527,
    hash: "0000_small_gargoyle_hash",
  },
];

export const journal = {
  version: "7",
  dialect: "sqlite",
  entries: [
    {
      idx: 0,
      version: "6",
      when: 1756331726858,
      tag: "0000_small_gargoyle",
      breakpoints: true,
    },
  ],
};
