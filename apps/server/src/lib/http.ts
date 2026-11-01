import type { Context } from "hono";
import type { ZodType } from "zod";
import { ApiError } from "../lib/errors";

export async function parseJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "Invalid request", parsed.error.flatten());
  }
  return parsed.data;
}

export function intParam(value: string | undefined, name = "id"): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new ApiError(400, `Invalid ${name}`);
  return Math.floor(parsed);
}

export function boolQuery(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
