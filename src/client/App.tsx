import { useState, useEffect, useRef } from "react";
import { hc } from "hono/client";
import type { ApiType } from "../index.js";

const client = hc<ApiType>("/");

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  model: string;
  createdAt: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load chat history on component mount
    loadChatHistory();
    checkOllamaStatus();
  }, []);

  const loadChatHistory = async () => {
    try {
      const response = await client.api.chat.history.$get();
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  const checkOllamaStatus = async () => {
    try {
      const response = await client.api.ollama.status.$get();
      const data = await response.json();
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

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: Date.now().toString(),
      content: userMessage,
      role: "user",
      model: "gemma3:270m",
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      // Use OpenAI-compatible endpoint
      const response = await client.v1["chat"]["completions"].$post({
        json: {
          model: "gemma3:270m",
          messages: [{ role: "user", content: userMessage }]
        }
      });
      const data = await response.json();

      if (data.choices && data.choices[0]) {
        const assistantResponse = data.choices[0].message.content;
        
        // Replace temp message and add assistant response
        setMessages(prev => {
          const withoutTemp = prev.slice(0, -1);
          const newUserMessage: Message = {
            id: crypto.randomUUID(),
            content: userMessage,
            role: "user",
            model: "gemma3:270m",
            createdAt: new Date().toISOString(),
          };
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            content: assistantResponse,
            role: "assistant",
            model: "gemma3:270m",
            createdAt: new Date().toISOString(),
          };
          return [...withoutTemp, newUserMessage, assistantMessage];
        });
      } else if (data.error) {
        // Remove temp message and show error
        setMessages(prev => prev.slice(0, -1));
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          content: `Error: ${data.error.message}`,
          role: "assistant",
          model: "error",
          createdAt: new Date().toISOString(),
        }]);
      }
    } catch (error) {
      // Remove temp message and show error
      setMessages(prev => prev.slice(0, -1));
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        content: "Error: Failed to send message",
        role: "assistant",
        model: "error",
        createdAt: new Date().toISOString(),
      }]);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">PremRunner Chat</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                ollamaStatus === 'running' ? 'bg-green-500' : 
                ollamaStatus === 'stopped' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <span className="text-sm text-gray-600">Ollama {ollamaStatus}</span>
            </div>
            <button
              onClick={clearChat}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Clear Chat
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-4xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">Welcome to PremRunner!</p>
            <p>Start a conversation with Ollama's gemma3:270m model.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : msg.model === 'error'
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : 'bg-white text-gray-800 border shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-800 border shadow-sm max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                    <span className="text-sm text-gray-500">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white border-t px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-4">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message... (Press Enter to send)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !inputMessage.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
