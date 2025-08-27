import { Hono } from "hono";
import { db } from "../db/index";
import { messages } from "../db/schema";
import { chatWithOllama } from "./ollama";

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
      
      // Get the last user message for the prompt
      const lastMessage = body.messages[body.messages.length - 1];
      if (lastMessage.role !== "user") {
        return c.json({ error: { message: "Last message must be from user" } }, 400);
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

      // Get response from Ollama
      const response = await chatWithOllama(model, prompt);

      // Save assistant response to database
      const assistantMessageId = crypto.randomUUID();
      await db.insert(messages).values({
        id: assistantMessageId,
        content: response,
        role: "assistant",
        model,
      });

      // Create OpenAI-compatible response
      const completion: ChatCompletionResponse = {
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
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
    } catch (error) {
      console.error("Chat completion error:", error);
      return c.json({ 
        error: { 
          message: "Internal server error",
          type: "server_error"
        } 
      }, 500);
    }
  });

export default v1Api;