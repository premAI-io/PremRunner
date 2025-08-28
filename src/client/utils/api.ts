export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

export async function authFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    // Token is invalid, clear it and reload
    localStorage.removeItem("authToken");
    window.location.reload();
  }

  return response;
}
