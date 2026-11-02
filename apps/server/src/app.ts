import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { config } from "./config";
import { ApiError } from "./lib/errors";
import { extractApiKey, isValidApiKey } from "./lib/auth";
import { logger } from "./lib/logger";
import { killSwitchServiceWorker, proxyTmdb } from "./services/proxy";
import { authRoute } from "./routes/auth";
import { healthRoute } from "./routes/health";
import { overviewRoute } from "./routes/overview";
import { eventsRoute } from "./routes/events";
import { settingsRoute } from "./routes/settings";
import { providersRoute } from "./routes/providers";
import { searchRoute } from "./routes/search";
import { moviesRoute } from "./routes/movies";
import { followsRoute } from "./routes/follows";
import { qbitRoute } from "./routes/qbit";
import { aiRoute } from "./routes/ai";

const PUBLIC_DIR = config.publicDir;
const WEB_DIR = path.join(PUBLIC_DIR, "web");
const WIDGET_DIR = path.join(PUBLIC_DIR, "widget");

function safeFile(base: string, relative: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }
  const target = path.resolve(base, decoded.replace(/^\/+/, ""));
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return null;
  if (!existsSync(target)) return null;
  try {
    if (!statSync(target).isFile()) return null;
  } catch {
    return null;
  }
  return target;
}

async function fileResponse(filePath: string, cacheControl: string): Promise<Response> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: {
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}

function spaResponse(cacheControl = "no-store, no-cache, must-revalidate"): Response | Promise<Response> {
  const indexPath = path.join(WEB_DIR, "index.html");
  if (!existsSync(indexPath)) {
    return new Response(
      "<!doctype html><html><body style=\"font-family:system-ui;background:#06100d;color:#d1fae5;padding:3rem\"><h1>See dashboard not built</h1><p>Run <code>bun run build</code> or use the production image.</p></body></html>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  const file = Bun.file(indexPath);
  return new Response(file, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

const app = new Hono();

app.use("*", async (c, next) => {
  const started = performance.now();
  await next();
  const duration = Math.round(performance.now() - started);
  if (!c.req.path.startsWith("/api/") || duration > 1000) {
    logger.debug("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: duration,
    });
  }
});

// The TMDB proxy and the dashboard shell stay public, but every data API
// needs the key printed at startup. Health stays open for container probes,
// and /api/auth/verify is the login handshake itself.
const PUBLIC_API_PATHS = new Set(["/api/health", "/api/auth/verify"]);

app.use("/api/*", async (c, next) => {
  if (PUBLIC_API_PATHS.has(c.req.path)) return next();
  const key = extractApiKey(c.req.raw.headers, new URL(c.req.url));
  if (!isValidApiKey(key)) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return next();
});

app.route("/api/auth", authRoute);
app.route("/api/health", healthRoute);
app.route("/api/overview", overviewRoute);
app.route("/api/events", eventsRoute);
app.route("/api/settings", settingsRoute);
app.route("/api/providers", providersRoute);
app.route("/api/movies", moviesRoute);
app.route("/api/follows", followsRoute);
app.route("/api/qbit", qbitRoute);
app.route("/api/ai", aiRoute);
app.route("/api", searchRoute);

app.all("/api/*", (c) => c.json({ error: "API route not found" }, 404));

app.get("/sw.js", () => killSwitchServiceWorker());
app.get("/service-worker.js", () => killSwitchServiceWorker());
app.get("/serviceworker.js", () => killSwitchServiceWorker());
app.get("/healthz", (c) => c.redirect("/api/health", 307));

app.get("/widget/*", async (c) => {
  const relative = c.req.path.replace(/^\/widget\/?/, "");
  if (!relative) return c.text("Widget bundle not found", 404);
  const file = safeFile(WIDGET_DIR, relative);
  if (!file) return c.text("Widget bundle not found. Run bun run build:widget.", 404);
  const immutable = relative.includes("-") && /\.(js|css)$/.test(relative);
  return fileResponse(file, immutable ? "public, max-age=31536000, immutable" : "no-store");
});

app.get("/ncore", (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`/see${url.search}`, 301);
});

app.get("/ncore/*", (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`/see${url.pathname.replace(/^\/ncore/, "")}${url.search}`, 301);
});

app.on(["GET", "HEAD"], "/see", () => spaResponse());

app.on(["GET", "HEAD"], "/see/*", async (c) => {
  const relative = c.req.path.replace(/^\/see\/?/, "");
  if (relative) {
    const file = safeFile(WEB_DIR, relative);
    if (file) {
      const immutable = relative.startsWith("assets/");
      return fileResponse(file, immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    }
    if (relative.startsWith("assets/")) return c.text("Asset not found", 404);
  }
  return spaResponse();
});

app.all("*", async (c) => {
  if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(c.req.method)) {
    return c.text("Method not allowed", 405);
  }
  const url = new URL(c.req.url);
  return proxyTmdb(c.req.raw, `${url.pathname}${url.search}`);
});

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.message, ...(error.details ? { details: error.details } : {}) }, error.status as never);
  }
  logger.error("Unhandled request error", {
    path: c.req.path,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return c.json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export { app };
