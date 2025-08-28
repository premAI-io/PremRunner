import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";
import { migrations } from "./migrations";

// Create database file if it doesn't exist
const sqlite = new Database("./data.db");
export const db = drizzle(sqlite, { schema });

// Initialize database with embedded or file-based migrations
export async function initializeDatabase() {
  console.log("🗄️ Initializing database...");

  try {
    console.log("📊 Running database migrations from files...");
    // Try to run migrations from the drizzle folder (works in development)
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✅ Database migrations completed successfully");
  } catch (error) {
    console.log("📊 Running embedded migrations for executable...");

    // Use embedded migrations for executable deployment
    try {
      // Check if we need to run migrations by checking if tables exist
      const tablesResult = sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table'")
        .all();
      const existingTables = tablesResult.map((row: any) => row.name);

      // If core tables already exist, skip migrations
      if (
        existingTables.includes("messages") &&
        existingTables.includes("models") &&
        existingTables.includes("traces")
      ) {
        console.log("✅ Database already initialized, skipping migrations");
        return;
      }

      // Run embedded migrations
      for (const migration of migrations) {
        const statements = migration.sql.split("--> statement-breakpoint");
        for (const statement of statements) {
          const trimmed = statement.trim();
          if (trimmed) {
            // Replace CREATE TABLE with CREATE TABLE IF NOT EXISTS
            const safeStatement = trimmed.replace(
              /CREATE TABLE/gi,
              "CREATE TABLE IF NOT EXISTS",
            );
            sqlite.exec(safeStatement);
          }
        }
      }

      console.log("✅ Embedded migrations completed successfully");
    } catch (migrationError) {
      console.error("❌ Migration failed:", migrationError);
      throw migrationError;
    }
  }
}
