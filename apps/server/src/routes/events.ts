import { Hono } from "hono";
import { recentEvents } from "../services/events";

export const eventsRoute = new Hono();

eventsRoute.get("/", (c) => {
  const raw = Number(c.req.query("limit") ?? 50);
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 50;
  return c.json({ events: recentEvents(limit) });
});
