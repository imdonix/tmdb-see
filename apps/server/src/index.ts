import { app } from "./app";
import { config } from "./config";
import { closeDatabase } from "./db";
import { apiKey } from "./lib/auth";
import { logger } from "./lib/logger";
import { providerManager } from "./providers/manager";
import { startSchedulers, stopSchedulers } from "./services/scheduler";
import { seedSettings } from "./services/settings";

seedSettings();
providerManager.seed();

const curlBin = Bun.which(process.env.CURL_BIN || "curl");
if (!curlBin) {
  logger.warn(
    "curl was not found. The TMDB proxy falls back to fetch, which Cloudflare may challenge. Install curl for reliable TMDB browsing.",
  );
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
  error(error) {
    logger.error("Bun server error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  },
});

startSchedulers();

logger.info(`See API key: ${apiKey}`);
logger.info("See is listening", {
  url: `http://${config.host}:${server.port}`,
  dataDir: config.dataDir,
  dashboard: "/see",
  tmdbProxy: "/",
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutting down", { signal });
  stopSchedulers();
  try {
    await server.stop(true);
  } catch {
    // ignore
  }
  closeDatabase();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
