import { useState } from "react";
import { hc } from "hono/client";
import type { ApiType } from "../index.js";

const client = hc<ApiType>("/");

export default function App() {
  const [message, setMessage] = useState<string>("");
  const [ollamaStatus, setOllamaStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const fetchHello = async () => {
    setLoading(true);
    try {
      const response = await client.api.hello.$get();
      const data = await response.json();
      setMessage(data.message);
    } catch (error) {
      setMessage("Error fetching from API");
    } finally {
      setLoading(false);
    }
  };

  const checkOllamaStatus = async () => {
    setLoading(true);
    try {
      const response = await client.api.ollama.status.$get();
      const data = await response.json();
      setOllamaStatus(`Ollama Status: ${data.status}`);
    } catch (error) {
      setOllamaStatus("Error checking Ollama status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          PremRunner
        </h1>
        <div className="space-y-4">
          <button
            onClick={fetchHello}
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-2 px-4 rounded"
          >
            {loading ? "Loading..." : "Fetch Hello World"}
          </button>
          <button
            onClick={checkOllamaStatus}
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-semibold py-2 px-4 rounded"
          >
            {loading ? "Loading..." : "Check Ollama Status"}
          </button>
          {message && (
            <div className="p-4 bg-green-50 border border-green-200 rounded">
              <p className="text-green-800">{message}</p>
            </div>
          )}
          {ollamaStatus && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded">
              <p className="text-blue-800">{ollamaStatus}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
