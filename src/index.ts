import { Hono } from "hono";
import { serve } from "bun";
import index from "./client/index.html";
import { ensureOllamaRunning, checkOllamaStatus } from "./api/ollama";
import chatApi from "./api/chat";
import v1Api from "./api/v1";

const app = new Hono()
  .get("/api/hello", (c) => {
    return c.json({ message: "Hello World from PremRunner API!" });
  })
  .get("/api/ollama/status", async (c) => {
    const status = await checkOllamaStatus();
    return c.json({ status });
  })
  .route("/api/chat", chatApi)
  .route("/v1", v1Api);

async function startServer() {
  // Ensure Ollama is running before starting the server
  console.log("🚀 Starting PremRunner...");

  const ollamaReady = await ensureOllamaRunning();
  if (!ollamaReady) {
    console.error("❌ Failed to start Ollama. Exiting...");
    process.exit(1);
  }

  const server = serve({
    port: 3001,
    fetch: app.fetch,
    routes: {
      "/": index,
    },
    development: {
      hmr: true,
    },
    maxRequestBodySize: 10 * 1024 * 1024 * 1024, // 10GB limit
  });

  console.log(`📊 Max request body size: 10 GB`);

  console.log("✅ Server running on http://localhost:3001");
}

startServer();

export type ApiType = typeof app;
