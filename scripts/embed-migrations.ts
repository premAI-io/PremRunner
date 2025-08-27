#!/usr/bin/env bun
// Script to embed Drizzle migrations into TypeScript for executable deployment

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

async function embedMigrations() {
  try {
    const drizzlePath = "./drizzle";
    const migrationsPath = "./src/db/migrations.ts";

    // Read journal
    const journalPath = join(drizzlePath, "meta", "_journal.json");
    const journalContent = await readFile(journalPath, "utf-8");
    const journal = JSON.parse(journalContent);

    // Read migration files
    const files = await readdir(drizzlePath);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    const migrations = [];

    for (const sqlFile of sqlFiles) {
      const sqlPath = join(drizzlePath, sqlFile);
      const sqlContent = await readFile(sqlPath, "utf-8");

      migrations.push({
        sql: sqlContent,
        bps: [],
        folderMillis: Date.now(),
        hash: sqlFile.replace(".sql", "_hash"),
      });
    }

    // Generate TypeScript file
    const tsContent = `// Embedded migrations for executable deployment
// This file is auto-generated from the drizzle migration files
// Run: bun scripts/embed-migrations.ts to update

export const migrations = ${JSON.stringify(migrations, null, 2)};

export const journal = ${JSON.stringify(journal, null, 2)};`;

    await writeFile(migrationsPath, tsContent);
    console.log("✅ Embedded migrations updated successfully");
  } catch (error) {
    console.error("❌ Failed to embed migrations:", error);
    process.exit(1);
  }
}

embedMigrations();
