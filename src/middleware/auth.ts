import { createMiddleware } from "hono/factory";
import config from "../config";

export const authMiddleware = createMiddleware(async (c, next) => {
  // Allow auth check endpoint without token
  if (c.req.path === "/api/auth/verify") {
    return next();
  }

  // Get token from Authorization header
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  if (token !== config.AUTH_TOKEN) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Set authenticated flag
  c.set("authenticated", true);

  await next();
});
