# PremRunner

This is website/api that wraps Ollama in order to allow a way to upload custom models with drag and drop in the browser and call them from the browser.

It will be compatible with Prem sdk.

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
