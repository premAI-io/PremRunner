import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  alias: text("alias").notNull(),
  size: integer("size"),
  downloaded: integer("downloaded", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});