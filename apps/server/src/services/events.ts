import type { AppEvent } from "@tmdb-see/shared";
import { addEventRow, listEventRows } from "../db/events";
import { logger } from "../lib/logger";

export function recordEvent(
  level: AppEvent["level"],
  type: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  try {
    addEventRow(level, type, message, meta);
  } catch (error) {
    logger.warn("Could not persist event", { error: String(error), type, message });
  }
  const log = level === "error" ? logger.error : level === "warning" ? logger.warn : logger.info;
  log(`[${type}] ${message}`, meta);
}

export function recentEvents(limit = 50): AppEvent[] {
  return listEventRows(limit).map((row) => {
    let meta: Record<string, unknown> | null = null;
    if (row.meta) {
      try {
        meta = JSON.parse(row.meta) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    return {
      id: row.id,
      level: row.level,
      type: row.type,
      message: row.message,
      meta,
      createdAt: row.created_at,
    };
  });
}
