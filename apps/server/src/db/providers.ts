import type { ProviderKind } from "@tmdb-see/shared";
import { db, nowIso } from "./index";

export interface ProviderRow {
  id: string;
  kind: ProviderKind;
  name: string;
  enabled: number;
  priority: number;
  config: string;
  created_at: string;
  updated_at: string;
}

export function listProviderRows(includeDisabled = true): ProviderRow[] {
  const sql = includeDisabled
    ? "SELECT * FROM providers ORDER BY priority ASC, name ASC"
    : "SELECT * FROM providers WHERE enabled = 1 ORDER BY priority ASC, name ASC";
  return db.query(sql).all() as ProviderRow[];
}

export function getProviderRow(id: string): ProviderRow | null {
  return (db.query("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | null) ?? null;
}

export function insertProviderRow(row: Omit<ProviderRow, "created_at" | "updated_at">): ProviderRow {
  const timestamp = nowIso();
  db.query(
    `INSERT INTO providers (id, kind, name, enabled, priority, config, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.kind, row.name, row.enabled, row.priority, row.config, timestamp, timestamp);
  return getProviderRow(row.id)!;
}

export function updateProviderRow(
  id: string,
  patch: Partial<Pick<ProviderRow, "kind" | "name" | "enabled" | "priority" | "config">>,
): ProviderRow | null {
  const existing = getProviderRow(id);
  if (!existing) return null;
  const next = { ...existing, ...patch, updated_at: nowIso() };
  db.query(
    `UPDATE providers SET kind = ?, name = ?, enabled = ?, priority = ?, config = ?, updated_at = ? WHERE id = ?`,
  ).run(next.kind, next.name, next.enabled, next.priority, next.config, next.updated_at, id);
  return getProviderRow(id);
}

export function deleteProviderRow(id: string): void {
  db.query("DELETE FROM providers WHERE id = ?").run(id);
}
