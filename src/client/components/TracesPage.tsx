import { useState, useEffect } from "react";
import { hc } from "hono/client";
import type { ApiType } from "../../index.js";

const client = hc<ApiType>("/");

interface Trace {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  duration: number;
  createdAt: string;
}

interface TraceDetail extends Trace {
  input: string;
  output: string;
}

export default function TracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadTraces();
  }, [page]);

  const loadTraces = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/v1/traces?page=${page}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setTraces(data.traces || []);
        setTotalPages(data.pages || 1);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error("Failed to load traces:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTraceDetail = async (traceId: string) => {
    try {
      const response = await fetch(`/v1/traces/${traceId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedTrace(data);
      }
    } catch (error) {
      console.error("Failed to load trace detail:", error);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-[73px] border-b border-stone-200 bg-stone-50 px-6 flex items-center">
        <div className="flex items-center justify-between w-full">
          <h2 className="text-lg font-semibold text-stone-950">Traces</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Page Description */}
          <p className="text-base font-medium text-stone-950 mb-6">
            View all chat interactions and their performance metrics
          </p>

          {/* Traces Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : traces.length === 0 ? (
            <div className="bg-stone-50 rounded-lg border border-stone-200 p-12 text-center">
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium text-stone-950 mb-1">
                No traces yet
              </p>
              <p className="text-sm text-stone-500">
                Start chatting with your models to see traces here
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Model
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Tokens
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-stone-200">
                    {traces.map((trace) => (
                      <tr key={trace.id} className="hover:bg-stone-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">
                          {formatDate(trace.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">
                          {trace.model}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">
                          {formatDuration(trace.duration)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-stone-900">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-500">In:</span>{" "}
                            {trace.promptTokens}
                            <span className="text-xs text-stone-500">
                              Out:
                            </span>{" "}
                            {trace.completionTokens}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => loadTraceDetail(trace.id)}
                            className="text-primary hover:text-blue-600 font-medium"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-stone-500">
                    Showing {(page - 1) * 20 + 1} to{" "}
                    {Math.min(page * 20, total)} of {total} traces
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm border border-stone-200 rounded-md text-stone-700 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm text-stone-700">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="px-3 py-1 text-sm border border-stone-200 rounded-md text-stone-700 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Trace Detail Modal */}
      {selectedTrace && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-stone-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-stone-950">
                  Trace Details
                </h3>
                <button
                  onClick={() => setSelectedTrace(null)}
                  className="p-1 hover:bg-stone-100 rounded transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-stone-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-stone-500 mb-1">
                      Model
                    </p>
                    <p className="text-sm text-stone-950">
                      {selectedTrace.model}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-500 mb-1">
                      Duration
                    </p>
                    <p className="text-sm text-stone-950">
                      {formatDuration(selectedTrace.duration)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-500 mb-1">
                      Total Tokens
                    </p>
                    <p className="text-sm text-stone-950">
                      {selectedTrace.totalTokens}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-500 mb-1">
                      Timestamp
                    </p>
                    <p className="text-sm text-stone-950">
                      {formatDate(selectedTrace.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Input */}
                <div>
                  <p className="text-sm font-medium text-stone-700 mb-2">
                    Input Conversation
                  </p>
                  <div className="bg-stone-50 rounded-lg p-4 border border-stone-200">
                    <pre className="text-sm text-stone-950 whitespace-pre-wrap">
                      {(() => {
                        try {
                          const messages = JSON.parse(selectedTrace.input);
                          return messages
                            .map(
                              (msg: any) =>
                                `[${msg.role.toUpperCase()}]: ${msg.content}`,
                            )
                            .join("\n\n");
                        } catch {
                          return selectedTrace.input;
                        }
                      })()}
                    </pre>
                  </div>
                </div>

                {/* Output */}
                <div>
                  <p className="text-sm font-medium text-stone-700 mb-2">
                    Model Response
                  </p>
                  <div className="bg-stone-50 rounded-lg p-4 border border-stone-200">
                    <pre className="text-sm text-stone-950 whitespace-pre-wrap">
                      {selectedTrace.output}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
