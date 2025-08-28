import { useState, useEffect, useRef } from "react";
import { hc } from "hono/client";
import type { ApiType } from "../../index.js";

const client = hc<ApiType>("/");

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  model: string;
  createdAt: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState("gemma3:270m");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadChatHistory();
    checkOllamaStatus();
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "48px";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
      textareaRef.current.style.overflowY = scrollHeight > 120 ? "auto" : "hidden";
    }
  }, [inputMessage]);

  const loadChatHistory = async () => {
    try {
      const response = await client.api.chat.history.$get();
      const data = await response.json() as any;
      setMessages(data.messages || []);
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  const checkOllamaStatus = async () => {
    try {
      const response = await client.api.ollama.status.$get();
      const data = await response.json() as any;
      setOllamaStatus(data.status);
    } catch (error) {
      setOllamaStatus("error");
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setLoading(true);

    const newUserMessage: Message = {
      id: crypto.randomUUID(),
      content: userMessage,
      role: "user",
      model: selectedModel,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newUserMessage]);

    // Always use streaming
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: "",
        role: "assistant",
        model: selectedModel,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const response = await fetch("/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: "user", content: userMessage }],
            stream: true,
          }),
        });

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  setLoading(false);
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    setMessages((prev) => {
                      const updated = [...prev];
                      const lastIndex = updated.length - 1;
                      if (
                        updated[lastIndex] &&
                        updated[lastIndex].role === "assistant"
                      ) {
                        updated[lastIndex] = {
                          ...updated[lastIndex],
                          content:
                            updated[lastIndex].content +
                            parsed.choices[0].delta.content,
                        };
                      }
                      return updated;
                    });
                  }
                } catch (parseError) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        console.error("Streaming error:", error);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: "Error: Failed to get streaming response",
            model: "error",
          };
          return updated;
        });
      } finally {
        setLoading(false);
      }
  };

  const clearChat = async () => {
    try {
      await client.api.chat.history.$delete();
      setMessages([]);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-[73px] border-b border-stone-200 bg-stone-50 px-6 flex items-center">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-stone-950">Chat</h2>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  ollamaStatus === "running"
                    ? "bg-green-500"
                    : ollamaStatus === "stopped"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              ></div>
              <span className="text-sm text-stone-600">
                {ollamaStatus === "running" ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-8 px-3 text-sm border border-stone-200 rounded-lg bg-white text-stone-950 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="gemma3:270m">gemma3:270m</option>
            </select>
            
            <button
              onClick={clearChat}
              className="h-8 px-3 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[740px] mx-auto py-8">
          {messages.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-stone-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-stone-950 mb-1">
                Start a conversation
              </h3>
              <p className="text-sm text-stone-500">
                Ask anything to your AI model
              </p>
            </div>
          ) : (
            <div className="space-y-4 px-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[42rem] ${
                      msg.role === "user" ? "ml-12" : "mr-12"
                    }`}
                  >
                    <div
                      className={`px-5 py-3 rounded-xl ${
                        msg.role === "user"
                          ? "bg-primary text-white"
                          : msg.model === "error"
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-stone-50 text-stone-950 border border-stone-200"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                    <p
                      className={`text-xs mt-2 px-1 ${
                        msg.role === "user" 
                          ? "text-right text-stone-500" 
                          : "text-left text-stone-500"
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="h-[88px] border-t border-stone-200 bg-stone-50 flex items-center">
        <div className="max-w-[740px] mx-auto px-4 w-full">
          <div className="flex gap-3 items-center">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                className="w-full px-4 py-3 border border-stone-200 rounded-lg bg-white text-stone-950 placeholder-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm leading-relaxed"
                rows={1}
                disabled={loading}
                style={{ minHeight: "48px" }}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={loading || !inputMessage.trim()}
              className="h-12 w-12 bg-primary text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}