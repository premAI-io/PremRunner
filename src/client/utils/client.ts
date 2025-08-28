import { hc } from "hono/client";
import type { AppType } from "../../index";

export function getClient() {
  const token = localStorage.getItem("authToken");

  return hc<AppType>("/", {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });
}

// Re-export for convenience
export { hc };
export type { AppType };
