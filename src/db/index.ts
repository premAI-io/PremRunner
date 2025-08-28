import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { join } from "path";
import * as schema from "./schema";
import config from "../config";

// Create database file directly in DATA_PATH
const dbPath = join(config.DATA_PATH, "data.db");
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
