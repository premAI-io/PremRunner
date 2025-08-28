import { useState } from "react";

interface AuthDialogProps {
  onAuthenticated: () => void;
}

export default function AuthDialog({ onAuthenticated }: AuthDialogProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        localStorage.setItem("authToken", token);
        onAuthenticated();
      } else {
        setError("Invalid token. Please try again.");
      }
    } catch (err) {
      setError("Failed to verify token. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Authentication Required
        </h2>
        <p className="text-gray-600 mb-6">
          Please enter your access token to continue.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter your access token"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
            minLength={10}
          />

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || token.length < 10}
            className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Authenticate"}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500 text-center">
          The token must be at least 10 characters long
        </p>
      </div>
    </div>
  );
}
