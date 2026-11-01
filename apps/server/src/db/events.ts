import { db, nowIso } from "./index";

export interface EventRow {
  id: number;
  level: "info" | "success" | "warning" | "error";
  type: string;
  message: string;
  meta: string | null;
  created_at: string;
}

export function addEventRow(
  level: EventRow["level"],
  type: string,
  message: string,
  meta?: unknown,
): void {
  db.query("INSERT INTO events (level, type, message, meta, created_at) VALUES (?, ?, ?, ?, ?)").run(
    level,
    type,
    message,
    meta === undefined ? null : JSON.stringify(meta),
    nowIso(),
  );
}

export function listEventRows(limit = 50): EventRow[] {
  return db.query("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(limit) as EventRow[];
}
