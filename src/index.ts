import { Hono } from "hono";
import { serve } from "bun";
import index from "./index.html";

const app = new Hono().get("/api/hello", (c) => {
  return c.json({ message: "Hello World from PremRunner API!" });
});

serve({
  port: 3001,
  fetch: app.fetch,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
  },
});

console.log("Server running on http://localhost:3001");

export type ApiType = typeof app;
