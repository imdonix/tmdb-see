import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time comparison so the key cannot be guessed from response timing. */
export function keysMatch(candidate: string | null | undefined, expected: string): boolean {
  if (!candidate || !expected) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

/**
 * Accept the key as a Bearer token, an X-API-Key header, or a `key` query
 * parameter (query params are needed for plain anchor downloads).
 */
export function extractApiKey(headers: Headers, url: URL): string {
  const authorization = headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  const header = headers.get("x-api-key");
  if (header) return header.trim();
  return (url.searchParams.get("key") ?? "").trim();
}
