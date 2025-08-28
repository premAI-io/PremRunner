---
description: PremRunner - Ollama wrapper with drag-and-drop model uploads
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: true
---

# PremRunner Project

PremRunner is a website/API that wraps Ollama to allow drag-and-drop model uploads and browser-based model interaction. Compatible with Prem SDK.

## Current Implementation Status

✅ **Completed:**

- Basic Hono server setup with hot reload on port 3001
- OpenAI-compatible `/v1/chat/completions` endpoint (streaming & non-streaming)
- Ollama integration with automatic startup management
- SQLite database with Drizzle ORM
- Database schema with 3 tables: `messages`, `models`, `traces`
- Basic chat API at `/api/chat`
- Messages storage with chat history
- Traces storage for tracking API usage (tokens, duration)
- React frontend with Tailwind CSS (CDN-based, no build step)
- Three-page SPA with navigation sidebar (Chat, Models, Traces)
- `/v1/models` endpoint - List available models ✅
- `/v1/models/upload` endpoint - Upload new model files ✅
- `/v1/models/:id` DELETE endpoint - Delete models ✅
- `/v1/models/:id/status` endpoint - Check model import status ✅
- `/v1/models/import` endpoint - Import model to Ollama ✅
- `/v1/traces` endpoint - List traces with pagination ✅
- `/v1/traces/:id` endpoint - Get trace details ✅
- Chunked upload system for large model files (via `/v1/chunked-upload/*`)
- Model import functionality to Ollama
- 10GB max request body size support

🚧 **In Progress:**

- Frontend implementation for model upload UI
- Frontend chat interface improvements

❌ **Not Yet Implemented:**

- Drag-and-drop interface for model uploads in frontend
- Complete frontend integration for all backend features
- WebSocket support for real-time updates

## Tech Stack & Tools

**Runtime & Package Manager:**

- Use Bun instead of Node.js
- `bun <file>` instead of `node <file>` or `ts-node <file>`
- `bun install` instead of npm/yarn/pnpm
- `bun run <script>` instead of npm/yarn scripts
- Bun automatically loads .env, so don't use dotenv
- Server runs on port 3001

**Database:**

- SQLite with `bun:sqlite` (Note: better-sqlite3 is in devDependencies but use bun:sqlite)
- Drizzle ORM for schema and queries
- Current tables:
  - `messages` - Stores chat messages
  - `models` - For uploaded models (schema defined, not yet used)
- Embedded migrations support for executable builds

**API Framework:**

- Hono for API routes (implemented)
- OpenAI chat completions API compatibility at `/v1/chat/completions` (implemented)
- Client uses `hc` from 'hono/client' for type-safe API calls

**Frontend:**

- React (supported natively by Bun)
- Tailwind CSS from CDN (no build step)
- HTML imports with `Bun.serve()` - no Vite
- Single Page Application (SPA) served at `/`

**External Dependencies:**

- Ollama binary management and API integration (implemented)
- WebSocket support built into Bun

## Database Schema (Drizzle + SQLite)

Current database schema with three tables:

```ts
// messages table - stores chat history
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// models table - stores uploaded model info
export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  alias: text("alias").notNull(),
  size: integer("size"),
  downloaded: integer("downloaded", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// traces table - stores API usage metrics
export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  input: text("input").notNull(), // JSON string of conversation
  output: text("output").notNull(), // Assistant response
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  duration: integer("duration"), // Time in milliseconds
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
```

## Ollama Integration

- Use the pattern from `usefulCodeToCopy/testForOllama.ts` for Ollama lifecycle management
- Ensure Ollama is running before API calls
- Handle model uploads via Ollama API
- Support both macOS and Linux environments

## API Structure

**Implemented endpoints:**

- `GET /api/hello` - Test endpoint ✅
- `GET /api/ollama/status` - Check Ollama status ✅
- `/api/chat` routes - Basic chat functionality ✅

**OpenAI-Compatible API (v1) Endpoints:**

- `POST /v1/chat/completions` - OpenAI compatible chat endpoint (streaming & non-streaming) ✅
- `GET /v1/models` - List available models ✅
- `POST /v1/models/upload` - Upload new model (supports large files) ✅
- `DELETE /v1/models/:id` - Delete model ✅
- `GET /v1/models/:id/status` - Check model import status ✅
- `POST /v1/models/import` - Import model to Ollama ✅
- `GET /v1/traces` - List traces with pagination ✅
- `GET /v1/traces/:id` - Get trace details ✅

**Chunked Upload Endpoints:**

- `POST /v1/chunked-upload/start` - Initialize chunked upload ✅
- `POST /v1/chunked-upload/chunk` - Upload a chunk ✅
- `POST /v1/chunked-upload/complete` - Assemble chunks ✅

**Frontend routes:**

- `/` - Main SPA with navigation ✅
  - Chat page - Basic chat interface ✅
  - Models page - Model management UI (partial) 🚧
  - Traces page - API usage tracking ✅

## Server Setup

```ts
import { Hono } from "hono";

const app = new Hono();

// Serve static HTML
app.get("/", async (c) => {
  return c.html(await Bun.file("./public/index.html").text());
});

// API routes
app.route("/v1", apiRoutes);

// Start server
Bun.serve({
  fetch: app.fetch,
  port: 3000,
  development: {
    hmr: true,
  },
});
```

## Frontend Architecture

Keep it simple:

- Single HTML file with React imports
- Tailwind from CDN
- No build process needed
- Use Hono client for API calls

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./app.tsx"></script>
  </body>
</html>
```

## MVP Features

1. **Chat Interface** - Simple chat UI for model interaction
2. **Model Upload** - Drag and drop model file uploads
3. **Models List** - View and manage uploaded models
4. **Ollama Management** - Automatic Ollama start/stop

## Key Patterns

- Always ensure Ollama is running before API calls
- Use Drizzle for all database operations
- Keep frontend state minimal
- No testing framework needed
- Use `Bun.file()` for file operations
- Use `Bun.$` for shell commands when needed

## Development Commands

- `bun run dev` or `bun --hot src/index.ts` - Start development server with hot reload
- `bun run format` - Format code with Prettier
- `bun run db:push` - Push database schema changes
- `bun run studio` - Open Drizzle Studio for database management
- `bun run start` - Run db:push and start server (production mode)
