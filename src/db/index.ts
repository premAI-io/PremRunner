import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

// Create database file if it doesn't exist
const sqlite = new Database("./data.db");
export const db = drizzle(sqlite, { schema });

// Initialize database with migrations
export async function initializeDatabase() {
  console.log("🗄️ Initializing database...");
  console.log("📊 Running database migrations...");
  
  // Run migrations from the drizzle folder
  await migrate(db, { migrationsFolder: "./drizzle" });
  
  console.log("✅ Database migrations completed successfully");
}