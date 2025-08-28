import { Hono } from "hono";
import { db } from "../db/index";
import { messages, models, traces } from "../db/schema";
import { chatWithOllama, chatWithOllamaStream } from "./ollama";
import { eq } from "drizzle-orm";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

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
  .post("/chat/completions", async (c) => {
  try {
    const body: ChatCompletionRequest = await c.req.json();

    if (!body.messages || body.messages.length === 0) {
      return c.json({ error: { message: "Messages are required" } }, 400);
    }

    const model = body.model || "gemma3:270m";
    const isStream = body.stream === true;

    // Get the last user message for the prompt
    const lastMessage = body.messages[body.messages.length - 1];
    if (lastMessage.role !== "user") {
      return c.json(
        { error: { message: "Last message must be from user" } },
        400,
      );
    }

    const prompt = lastMessage.content;

    // Save user message to database
    const userMessageId = crypto.randomUUID();
    await db.insert(messages).values({
      id: userMessageId,
      content: prompt,
      role: "user",
      model,
    });

    const chatId = `chatcmpl-${crypto.randomUUID()}`;
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
            for await (const chunk of chatWithOllamaStream(model, prompt)) {
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
            const assistantMessageId = crypto.randomUUID();
            await db.insert(messages).values({
              id: assistantMessageId,
              content: fullResponse,
              role: "assistant",
              model,
            });

            // Save trace
            const duration = Date.now() - startTime;
            await db.insert(traces).values({
              id: crypto.randomUUID(),
              input: JSON.stringify(body.messages),
              output: fullResponse,
              model,
              promptTokens: Math.round(JSON.stringify(body.messages).length / 4),
              completionTokens: Math.round(fullResponse.length / 4),
              totalTokens: Math.round((JSON.stringify(body.messages).length + fullResponse.length) / 4),
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
      const response = await chatWithOllama(model, prompt);
      const duration = Date.now() - startTime;

      // Save assistant response to database
      const assistantMessageId = crypto.randomUUID();
      await db.insert(messages).values({
        id: assistantMessageId,
        content: response,
        role: "assistant",
        model,
      });

      // Save trace
      await db.insert(traces).values({
        id: crypto.randomUUID(),
        input: JSON.stringify(body.messages),
        output: response,
        model,
        promptTokens: Math.round(JSON.stringify(body.messages).length / 4),
        completionTokens: Math.round(response.length / 4),
        totalTokens: Math.round((JSON.stringify(body.messages).length + response.length) / 4),
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
          prompt_tokens: prompt.length / 4, // Rough estimation
          completion_tokens: response.length / 4, // Rough estimation
          total_tokens: (prompt.length + response.length) / 4,
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
      const formattedModels = modelList.map(model => ({
        id: model.id,
        object: "model",
        created: model.createdAt ? Math.floor(model.createdAt.getTime() / 1000) : Date.now() / 1000,
        owned_by: "user",
        permission: [],
        root: model.name,
        parent: null,
      }));

      return c.json({
        object: "list",
        data: formattedModels,
        models: modelList.map(m => ({
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
      const formData = await c.req.formData();
      const file = formData.get("file") as File;
      const name = formData.get("name") as string;

      if (!file || !name) {
        return c.json(
          { error: { message: "File and name are required" } },
          400,
        );
      }

      // Create uploads directory if it doesn't exist
      const uploadsDir = join(process.cwd(), "uploads");
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
      }

      // Save the file
      const modelId = crypto.randomUUID();
      const filePath = join(uploadsDir, `${modelId}.zip`);
      const arrayBuffer = await file.arrayBuffer();
      await Bun.write(filePath, arrayBuffer);

      // Save model info to database
      await db.insert(models).values({
        id: modelId,
        name: name,
        alias: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        size: file.size,
        downloaded: false,
      });

      return c.json({
        id: modelId,
        message: "Model uploaded successfully",
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
      
      // Delete from database
      await db.delete(models).where(eq(models.id, modelId));
      
      // Delete file if it exists
      const filePath = join(process.cwd(), "uploads", `${modelId}.zip`);
      if (existsSync(filePath)) {
        await Bun.$`rm -f ${filePath}`;
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
  .get("/traces", async (c) => {
    try {
      const page = parseInt(c.req.query("page") || "1");
      const limit = parseInt(c.req.query("limit") || "20");
      const offset = (page - 1) * limit;

      const allTraces = await db.select().from(traces).orderBy(traces.createdAt);
      const paginatedTraces = allTraces.slice(offset, offset + limit);
      
      return c.json({
        traces: paginatedTraces.map(t => ({
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
      const trace = await db.select().from(traces).where(eq(traces.id, traceId)).limit(1);
      
      if (trace.length === 0) {
        return c.json(
          { error: { message: "Trace not found" } },
          404,
        );
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
