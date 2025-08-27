---
description: PremRunner - Ollama wrapper with drag-and-drop model uploads
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: true
---

# PremRunner Project

PremRunner is a website/API that wraps Ollama to allow drag-and-drop model uploads and browser-based model interaction. Compatible with Prem SDK.

## Tech Stack & Tools

**Runtime & Package Manager:**

- Use Bun instead of Node.js
- `bun <file>` instead of `node <file>` or `ts-node <file>`
- `bun install` instead of npm/yarn/pnpm
- `bun run <script>` instead of npm/yarn scripts
- Bun automatically loads .env, so don't use dotenv

**Database:**

- SQLite with `bun:sqlite` (don't use better-sqlite3)
- Drizzle ORM for schema and queries
- Simple models table for uploaded models

**API Framework:**

- Use Hono for API routes (already in usefulCodeToCopy/)
- Maintain OpenAI chat completions API compatibility for `/v1/chat/completions`
- Client uses `hc` from 'hono/client' for type-safe API calls

**Frontend:**

- React (supported natively by Bun)
- Tailwind CSS from CDN (no build step)
- HTML imports with `Bun.serve()` - no Vite
- Single Page Application (SPA)

**External Dependencies:**

- Ollama binary management and API integration
- WebSocket support built into Bun

## Database Schema (Drizzle + SQLite)

Create a simple models table:

```ts
import { sqliteTable, text, integer, boolean } from "drizzle-orm/sqlite-core";

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  alias: text("alias").notNull(),
  size: integer("size"),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }),
  active: boolean("active").default(true),
});
```

## Ollama Integration

- Use the pattern from `usefulCodeToCopy/testForOllama.ts` for Ollama lifecycle management
- Ensure Ollama is running before API calls
- Handle model uploads via Ollama API
- Support both macOS and Linux environments

## API Structure

**Required endpoints for Prem SDK compatibility:**

- `POST /v1/chat/completions` - OpenAI compatible chat endpoint
- `GET /v1/models` - List available models
- Model management endpoints for upload/delete

**Frontend routes:**

- `/` - Main chat interface
- Model upload interface
- Models list/management

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

- `bun --hot index.ts` - Start development server
- `bun run format` - Format code with Prettier
