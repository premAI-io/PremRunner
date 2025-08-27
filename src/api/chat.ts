import { Hono } from "hono";
import { db } from "../db/index";
import { messages } from "../db/schema";
import { chatWithOllama } from "./ollama";

const chatApi = new Hono()
  .post("/send", async (c) => {
    try {
      const { message, model = "gemma3:270m" } = await c.req.json();

      if (!message) {
        return c.json({ error: "Message is required" }, 400);
      }

      // Save user message to database
      const userMessageId = crypto.randomUUID();
      await db.insert(messages).values({
        id: userMessageId,
        content: message,
        role: "user",
        model,
      });

      // Get response from Ollama
      const response = await chatWithOllama(model, message);

      // Save assistant response to database
      const assistantMessageId = crypto.randomUUID();
      await db.insert(messages).values({
        id: assistantMessageId,
        content: response,
        role: "assistant",
        model,
      });

      return c.json({
        userMessage: {
          id: userMessageId,
          content: message,
          role: "user",
          model,
        },
        assistantMessage: {
          id: assistantMessageId,
          content: response,
          role: "assistant",
          model,
        },
      });
    } catch (error) {
      console.error("Chat error:", error);
      return c.json({ error: "Failed to process chat message" }, 500);
    }
  })
  .get("/history", async (c) => {
    try {
      const chatHistory = await db
        .select()
        .from(messages)
        .orderBy(messages.createdAt)
        .limit(50);

      return c.json({ messages: chatHistory });
    } catch (error) {
      console.error("Error fetching chat history:", error);
      return c.json({ error: "Failed to fetch chat history" }, 500);
    }
  })
  .delete("/history", async (c) => {
    try {
      await db.delete(messages);
      return c.json({ success: true });
    } catch (error) {
      console.error("Error clearing chat history:", error);
      return c.json({ error: "Failed to clear chat history" }, 500);
    }
  });

export default chatApi;
