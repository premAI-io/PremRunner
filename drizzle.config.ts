import { defineConfig } from "drizzle-kit";
import { join } from "path";
import config from "./src/config";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: join(config.DATA_PATH, "data.db"),
  },
});
