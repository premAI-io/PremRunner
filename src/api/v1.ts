import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db } from "../db/index";
import { messages, models, traces } from "../db/schema";
import { chatWithOllama, chatWithOllamaStream } from "./ollama";
import { eq } from "drizzle-orm";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { importModelToOllama, deleteModelFromOllama } from "./import-model";
import chunkedUpload from "./chunked-upload";
import config from "../config";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
}

interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const v1Api = new Hono()
  .route("/chunked-upload", chunkedUpload)
  .post("/chat/completions", async (c) => {
    try {
      const body: ChatCompletionRequest = await c.req.json();

      if (!body.messages || body.messages.length === 0) {
        return c.json({ error: { message: "Messages are required" } }, 400);
      }

      const model = body.model || "gemma3:270m";
      const isStream = body.stream === true;

      // Get the last message and ensure it's from user
      const lastMessage = body.messages[body.messages.length - 1];
      if (lastMessage.role !== "user") {
        return c.json(
          { error: { message: "Last message must be from user" } },
          400,
        );
      }

      // Save user message to database
      const userMessageId = nanoid();
      await db.insert(messages).values({
        id: userMessageId,
        content: lastMessage.content,
        role: "user",
        model,
      });

      const chatId = `chatcmpl-${nanoid()}`;
      const created = Math.floor(Date.now() / 1000);

      if (isStream) {
        // Streaming response
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let fullResponse = "";
            const startTime = Date.now();

            try {
              for await (const chunk of chatWithOllamaStream(
                model,
                body.messages,
              )) {
                fullResponse += chunk;

                const streamChunk = {
                  id: chatId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: chunk },
                      finish_reason: null,
                    },
                  ],
                };

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(streamChunk)}\n\n`),
                );
              }

              // Final chunk
              const finalChunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: "stop",
                  },
                ],
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));

              // Save assistant response to database
              const assistantMessageId = nanoid();
              await db.insert(messages).values({
                id: assistantMessageId,
                content: fullResponse,
                role: "assistant",
                model,
              });

              // Save trace
              const duration = Date.now() - startTime;
              await db.insert(traces).values({
                id: nanoid(),
                input: JSON.stringify(body.messages),
                output: fullResponse,
                model,
                promptTokens: Math.round(
                  JSON.stringify(body.messages).length / 4,
                ),
                completionTokens: Math.round(fullResponse.length / 4),
                totalTokens: Math.round(
                  (JSON.stringify(body.messages).length + fullResponse.length) /
                    4,
                ),
                duration,
              });
            } catch (error) {
              console.error("Streaming error:", error);
              controller.error(error);
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream);
      } else {
        // Non-streaming response
        const startTime = Date.now();
        const response = await chatWithOllama(model, body.messages);
        const duration = Date.now() - startTime;

        // Save assistant response to database
        const assistantMessageId = nanoid();
        await db.insert(messages).values({
          id: assistantMessageId,
          content: response,
          role: "assistant",
          model,
        });

        // Save trace
        await db.insert(traces).values({
          id: nanoid(),
          input: JSON.stringify(body.messages),
          output: response,
          model,
          promptTokens: Math.round(JSON.stringify(body.messages).length / 4),
          completionTokens: Math.round(response.length / 4),
          totalTokens: Math.round(
            (JSON.stringify(body.messages).length + response.length) / 4,
          ),
          duration,
        });

        // Create OpenAI-compatible response
        const completion: ChatCompletionResponse = {
          id: chatId,
          object: "chat.completion",
          created,
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: response,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: JSON.stringify(body.messages).length / 4, // Rough estimation
            completion_tokens: response.length / 4, // Rough estimation
            total_tokens:
              (JSON.stringify(body.messages).length + response.length) / 4,
          },
        };

        return c.json(completion);
      }
    } catch (error) {
      console.error("Chat completion error:", error);
      return c.json(
        {
          error: {
            message: "Internal server error",
            type: "server_error",
          },
        },
        500,
      );
    }
  })
  .get("/models", async (c) => {
    try {
      const modelList = await db.select().from(models);

      // Format response to be OpenAI-compatible
      const formattedModels = modelList.map((model) => ({
        id: model.id,
        object: "model",
        created: model.createdAt
          ? Math.floor(model.createdAt.getTime() / 1000)
          : Date.now() / 1000,
        owned_by: "user",
        permission: [],
        root: model.name,
        parent: null,
      }));

      return c.json({
        object: "list",
        data: formattedModels,
        models: modelList.map((m) => ({
          id: m.id,
          name: m.name,
          size: m.size,
          uploadedAt: m.createdAt?.toISOString(),
          active: m.downloaded || false,
        })),
      });
    } catch (error) {
      console.error("Failed to list models:", error);
      return c.json(
        {
          error: {
            message: "Failed to list models",
            type: "server_error",
          },
        },
        500,
      );
    }
  })
  .post("/models/upload", async (c) => {
    try {
      console.log(`📤 Upload request received`);
      const contentLength = c.req.header("content-length");
      console.log(`📊 Content-Length header: ${contentLength}`);
      if (contentLength) {
        const sizeGB = parseInt(contentLength) / 1024 / 1024 / 1024;
        console.log(`📊 Expected file size: ${sizeGB.toFixed(2)} GB`);
      }

      const formData = await c.req.formData();
      const file = formData.get("file") as File;
      let name = formData.get("name") as string;

      console.log(
        `📊 Received file size: ${file ? (file.size / 1024 / 1024 / 1024).toFixed(2) : "unknown"} GB`,
      );

      if (!file || !name) {
        return c.json(
          { error: { message: "File and name are required" } },
          400,
        );
      }

      // Clean up the model name - remove any non-ASCII characters
      name = name.replace(/[^\x00-\x7F]/g, "").trim();
      if (!name) {
        name = `model_${Date.now()}`; // Fallback if name becomes empty
      }

      console.log(`📝 Original file name: ${file.name}`);
      console.log(`📝 Cleaned model name: ${name}`);

      // Use DATA_PATH for uploads directory
      const uploadsDir = join(config.DATA_PATH, "uploads");

      // Save the file
      const modelId = nanoid();
      const filePath = join(uploadsDir, `${modelId}.zip`);
      const arrayBuffer = await file.arrayBuffer();

      console.log(`📁 Saving uploaded file for model: ${name}`);
      console.log(`📊 File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`📍 Save path: ${filePath}`);

      await Bun.write(filePath, arrayBuffer);

      // Verify the file was saved correctly
      const savedFile = Bun.file(filePath);
      const savedSize = savedFile.size;
      console.log(
        `✅ File saved successfully, size: ${(savedSize / 1024 / 1024).toFixed(2)} MB`,
      );

      if (savedSize !== file.size) {
        console.error(
          `⚠️ Warning: Saved file size (${savedSize}) doesn't match original (${file.size})`,
        );
      }

      // Check first few bytes to see what type of file this is
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 4));
      const header = Array.from(headerBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      console.log(`🔍 File header (first 4 bytes): ${header}`);

      // ZIP files should start with PK (50 4B)
      if (headerBytes[0] === 0x50 && headerBytes[1] === 0x4b) {
        console.log(`✅ File has valid ZIP header (PK)`);
        // Check ZIP version
        if (headerBytes[2] === 0x07 || headerBytes[2] === 0x08) {
          console.log(`⚠️ This appears to be a ZIP64 or spanned archive`);
        }
      } else {
        console.error(
          `❌ File does not have ZIP header. Expected 50 4B, got ${header}`,
        );
      }

      // Save model info to database
      const modelAlias = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      await db.insert(models).values({
        id: modelId,
        name: name,
        alias: modelAlias,
        size: file.size,
        downloaded: false,
      });

      // Start import process in background
      importModelToOllama(modelId, modelAlias, filePath).catch((error) => {
        console.error(`Failed to import model ${name}:`, error);
        // Update database to reflect failure
        db.update(models)
          .set({ downloaded: false })
          .where(eq(models.id, modelId))
          .catch(console.error);
      });

      return c.json({
        id: modelId,
        message: "Model uploaded successfully, import started",
        path: filePath,
      });
    } catch (error) {
      console.error("Upload error:", error);
      return c.json(
        {
          error: {
            message: "Failed to upload model",
            type: "server_error",
          },
        },
        500,
      );
    }
  })
  .delete("/models/:id", async (c) => {
    try {
      const modelId = c.req.param("id");

      // Get model info first
      const model = await db
        .select()
        .from(models)
        .where(eq(models.id, modelId))
        .limit(1);

      if (model.length > 0 && model[0].downloaded) {
        // Delete from Ollama if it was imported
        await deleteModelFromOllama(model[0].alias);
      }

      // Delete from database
      await db.delete(models).where(eq(models.id, modelId));

      // Delete files from DATA_PATH
      const zipPath = join(config.DATA_PATH, "uploads", `${modelId}.zip`);
      const extractPath = join(config.DATA_PATH, "models", modelId);

      if (existsSync(zipPath)) {
        await Bun.$`rm -f ${zipPath}`;
      }
      if (existsSync(extractPath)) {
        await Bun.$`rm -rf ${extractPath}`;
      }

      return c.json({ message: "Model deleted successfully" });
    } catch (error) {
      console.error("Delete error:", error);
      return c.json(
        {
          error: {
            message: "Failed to delete model",
            type: "server_error",
          },
        },
        500,
      );
    }
  })
  .post("/models/import", async (c) => {
    try {
      const formData = await c.req.formData();
      const modelId = formData.get("modelId") as string;
      const modelName = formData.get("modelName") as string;
      const filePath = formData.get("filePath") as string;

      if (!modelId || !modelName || !filePath) {
        return c.json({ error: { message: "Missing required fields" } }, 400);
      }

      // Save model info to database
      const modelAlias = modelName.toLowerCase().replace(/[^a-z0-9]/g, "-");
      await db.insert(models).values({
        id: modelId,
        name: modelName,
        alias: modelAlias,
        size: Bun.file(filePath).size,
        downloaded: false,
      });

      // Start import process in background
      importModelToOllama(modelId, modelAlias, filePath).catch((error) => {
        console.error(`Failed to import model ${modelName}:`, error);
        db.update(models)
          .set({ downloaded: false })
          .where(eq(models.id, modelId))
          .catch(console.error);
      });

      return c.json({
        id: modelId,
        message: "Model import started",
      });
    } catch (error) {
      console.error("Import error:", error);
      return c.json({ error: { message: "Failed to start import" } }, 500);
    }
  })
  .get("/models/:id/status", async (c) => {
    try {
      const modelId = c.req.param("id");
      const model = await db
        .select()
        .from(models)
        .where(eq(models.id, modelId))
        .limit(1);

      if (model.length === 0) {
        return c.json({ error: { message: "Model not found" } }, 404);
      }

      return c.json({
        id: model[0].id,
        name: model[0].name,
        alias: model[0].alias,
        imported: model[0].downloaded || false,
        status: model[0].downloaded ? "ready" : "importing",
      });
    } catch (error) {
      console.error("Failed to get model status:", error);
      return c.json(
        {
          error: {
            message: "Failed to get model status",
            type: "server_error",
          },
        },
        500,
      );
    }
  })
  .get("/traces", async (c) => {
    try {
      const page = parseInt(c.req.query("page") || "1");
      const limit = parseInt(c.req.query("limit") || "20");
      const offset = (page - 1) * limit;

      const allTraces = await db
        .select()
        .from(traces)
        .orderBy(traces.createdAt);
      const paginatedTraces = allTraces.slice(offset, offset + limit);

      return c.json({
        traces: paginatedTraces.map((t) => ({
          id: t.id,
          model: t.model,
          promptTokens: t.promptTokens,
          completionTokens: t.completionTokens,
          totalTokens: t.totalTokens,
          duration: t.duration,
          createdAt: t.createdAt?.toISOString(),
        })),
        total: allTraces.length,
        page,
        limit,
        pages: Math.ceil(allTraces.length / limit),
      });
    } catch (error) {
      console.error("Failed to list traces:", error);
      return c.json(
        {
          error: {
            message: "Failed to list traces",
            type: "server_error",
          },
        },
        500,
      );
    }
  })
  .get("/traces/:id", async (c) => {
    try {
      const traceId = c.req.param("id");
      const trace = await db
        .select()
        .from(traces)
        .where(eq(traces.id, traceId))
        .limit(1);

      if (trace.length === 0) {
        return c.json({ error: { message: "Trace not found" } }, 404);
      }

      return c.json({
        id: trace[0].id,
        input: trace[0].input,
        output: trace[0].output,
        model: trace[0].model,
        promptTokens: trace[0].promptTokens,
        completionTokens: trace[0].completionTokens,
        totalTokens: trace[0].totalTokens,
        duration: trace[0].duration,
        createdAt: trace[0].createdAt?.toISOString(),
      });
    } catch (error) {
      console.error("Failed to get trace:", error);
      return c.json(
        {
          error: {
            message: "Failed to get trace",
            type: "server_error",
          },
        },
        500,
      );
    }
  });

export default v1Api;
