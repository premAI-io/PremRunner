import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

// Create database file if it doesn't exist
const sqlite = new Database("./data.db");
export const db = drizzle(sqlite, { schema });
