import { Hono } from "hono";
import { db } from "../db";
import { config } from "../config";

export const healthRoute = new Hono();

function uptime(): number {
  return Math.round(process.uptime());
}

healthRoute.get("/", (c) => {
  let dbStatus: "ok" | "error" = "ok";
  try {
    db.query("SELECT 1").get();
  } catch {
    dbStatus = "error";
  }
  return c.json(
    {
      status: dbStatus === "ok" ? "ok" : "degraded",
      version: config.version,
      db: dbStatus,
      uptimeSeconds: uptime(),
    },
    dbStatus === "ok" ? 200 : 503,
  );
});
