import { config } from "../config";
import { logger } from "../lib/logger";
import { getPrivateSettings } from "./settings";
import { checkAllFollows } from "./follow";
import { syncTrackedDownloads } from "./tracker";

let followStartupTimer: ReturnType<typeof setTimeout> | null = null;
let followIntervalTimer: ReturnType<typeof setInterval> | null = null;
let trackerIntervalTimer: ReturnType<typeof setInterval> | null = null;
let followRunning = false;

async function runFollowCycle(): Promise<void> {
  if (followRunning) return;
  followRunning = true;
  try {
    await checkAllFollows();
  } catch (error) {
    logger.error("Follow cycle failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    followRunning = false;
  }
}

function scheduleFollowInterval(): void {
  if (followStartupTimer) clearTimeout(followStartupTimer);
  if (followIntervalTimer) clearInterval(followIntervalTimer);
  followStartupTimer = setTimeout(() => {
    logger.info("Running initial follow check");
    void runFollowCycle();
  }, 30_000);
  const minutes = Math.max(5, getPrivateSettings().app.followIntervalMinutes || config.followIntervalMinutes);
  followIntervalTimer = setInterval(() => {
    logger.info("Running scheduled follow check", { intervalMinutes: minutes });
    void runFollowCycle();
  }, minutes * 60_000);
}

export function restartFollowScheduler(): void {
  if (config.disableScheduler) return;
  scheduleFollowInterval();
}

export function startSchedulers(): void {
  if (config.disableScheduler) {
    logger.info("Background schedulers disabled");
    return;
  }
  scheduleFollowInterval();
  trackerIntervalTimer = setInterval(() => {
    void syncTrackedDownloads();
  }, 60_000);
  logger.info("Background schedulers started");
}

export function stopSchedulers(): void {
  if (followStartupTimer) clearTimeout(followStartupTimer);
  if (followIntervalTimer) clearInterval(followIntervalTimer);
  if (trackerIntervalTimer) clearInterval(trackerIntervalTimer);
  followStartupTimer = null;
  followIntervalTimer = null;
  trackerIntervalTimer = null;
}
