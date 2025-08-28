# PremRunner

A web application and API that wraps Ollama to enable browser-based model uploads and interactions. Compatible with Prem SDK.

## System Requirements

- **macOS** (Apple Silicon or Intel)
- **Ubuntu** (20.04 or later)

## Prerequisites

Before running PremRunner, you need to install the following:

### 1. Install Bun

```bash
# macOS/Ubuntu
curl -fsSL https://bun.sh/install | bash
```

### 2. Install Node.js (required for database migrations)

```bash
# macOS
brew install node

# Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Install Ollama

```bash
# macOS
brew install ollama

# Ubuntu
curl -fsSL https://ollama.com/install.sh | sh
```

### 4. Install unzip (if not already installed)

```bash
# macOS (usually pre-installed)
# If needed: brew install unzip

# Ubuntu
sudo apt-get install unzip
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/premAI-io/PremRunner.git
cd PremRunner
```

2. Install dependencies:

```bash
bun install
```

3. Set up environment variables:

```bash
# Create a .env file with:
DATA_PATH=/path/to/your/data  # Where to store uploads, models, and database
AUTH_TOKEN=your-secret-token-here  # Authentication token (minimum 10 characters)

# Example:
# DATA_PATH=./premrunner-data
# AUTH_TOKEN=my-secure-token-12345
```

The AUTH_TOKEN can be any string with at least 10 characters. For better security, use a longer random string.

## Running the Application

Start the server:

```bash
bun start
```

This command will:

1. Push database schema changes
2. Create the DATA_PATH directory and subdirectories if they don't exist
3. Start Ollama automatically if it's not running
4. Launch the web server on http://localhost:3001

For development with hot reload:

```bash
bun run dev
```

## Usage

Once running, navigate to http://localhost:3001 in your browser to:

- Chat with models via the Chat interface
- Upload and manage custom models
- View API usage traces

The API is OpenAI-compatible and accessible at:

- `POST /v1/chat/completions` - Chat completions endpoint
- `GET /v1/models` - List available models
- `POST /v1/models/upload` - Upload new models

## Troubleshooting

### Database Migration Errors

If you encounter errors when running `bun start` related to drizzle-kit or better-sqlite3:

1. **Ensure Node.js is installed** (drizzle-kit requires Node.js):
```bash
node --version  # Should show v18 or higher
```

If Node.js is missing or outdated, install it as shown in the prerequisites.

2. **Clean and reinstall if needed:**
```bash
rm -rf node_modules bun.lockb
bun install
```

## Features

- Upload custom models with drag and drop in the browser
- Call models from the browser
- Use Prem sdk to interact with the models

Tech stack:

- Bun
- db: Native bun sqlite + drizzle
- react supported natively by bun (no build process)
- tailwindcss (from cdn for now build step)
- ollama

The client will be a SPA that interact with the api only using hono client (import { hc } from 'hono/client').

This needs to be extremely easy to use, just run a single binary in any server. So we'll use bun to build the binary.
https://bun.com/docs/bundler/executables

https://hono.dev/llms-full.txt

in testForOllama.ts I put a test script that checks if ollama is running and if not it starts it and waits for it to be ready, We will need to be working both on mac and linux.

The MVP is: website that allows to chat with a model, upload models and see all the active models in a list. Also the API needs to be compatible with Prem sdk (in premSaaSRelevantCode there is the interface that we need to mimic here but can't rely on the proxy gateway, we need to use the ollama api directly)

(test change ownership)
