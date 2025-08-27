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
      // Run embedded migrations
      for (const migration of migrations) {
        const statements = migration.sql.split("--> statement-breakpoint");
        for (const statement of statements) {
          const trimmed = statement.trim();
          if (trimmed) {
            sqlite.exec(trimmed);
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