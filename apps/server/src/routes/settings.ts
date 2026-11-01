import { Hono } from "hono";
import { invalidateQbitClient, testQbit } from "../services/qbit";
import { getPublicSettings, updateSettings } from "../services/settings";
import { testTmdb } from "../services/tmdb";
import { restartFollowScheduler } from "../services/scheduler";
import { recordEvent } from "../services/events";
import { parseJson } from "../lib/http";
import { qbitOverridesSchema, settingsUpdateSchema } from "./schemas";

export const settingsRoute = new Hono();

settingsRoute.get("/", (c) => c.json(getPublicSettings()));

settingsRoute.patch("/", async (c) => {
  const input = await parseJson(c, settingsUpdateSchema);
  const settings = updateSettings(input);
  invalidateQbitClient();
  restartFollowScheduler();
  recordEvent("info", "settings", "Settings updated");
  return c.json(settings);
});

settingsRoute.post("/test/qbit", async (c) => {
  const body = await c.req.text();
  let overrides: { host?: string; username?: string; password?: string } = {};
  if (body.trim()) {
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = qbitOverridesSchema.safeParse(parsedBody);
    if (!parsed.success) return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    overrides = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => typeof value === "string" && value !== ""),
    ) as typeof overrides;
  }
  const health = await testQbit(overrides);
  return c.json({ health });
});

settingsRoute.post("/test/tmdb", async (c) => {
  return c.json({ health: await testTmdb() });
});
