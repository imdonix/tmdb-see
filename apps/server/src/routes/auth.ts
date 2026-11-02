import { Hono } from "hono";
import { isValidApiKey } from "../lib/auth";

export const authRoute = new Hono();

/**
 * Public key check used by the TMDB login popup and the widget. The key is
 * random and compared in constant time, so the endpoint does not leak it.
 */
authRoute.post("/verify", async (c) => {
  let candidate = "";
  try {
    const body = (await c.req.json()) as { apiKey?: unknown };
    if (typeof body.apiKey === "string") candidate = body.apiKey.trim();
  } catch {
    candidate = "";
  }
  if (!isValidApiKey(candidate)) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  return c.json({ ok: true });
});

/** Protected: the dashboard and widget use it to validate a stored key. */
authRoute.get("/session", (c) => c.json({ ok: true }));
