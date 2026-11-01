import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "../lib/logger";

export interface UpstreamResult {
  status: number;
  statusText: string;
  headers: Headers;
  body: Uint8Array;
}

const FORWARD_HEADERS = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "cookie",
  "origin",
  "pragma",
  "referer",
  "user-agent",
]);

const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const assetCache = new Map<string, { at: number; result: UpstreamResult }>();
let assetCacheBytes = 0;
const ASSET_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const ASSET_CACHE_TTL = 60 * 60 * 1000;

function cacheAsset(key: string, result: UpstreamResult): void {
  const contentType = result.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") || result.status !== 200) return;
  if (result.headers.get("set-cookie")) return;
  if (result.body.byteLength > 5 * 1024 * 1024) return;
  if (assetCache.has(key)) {
    const previous = assetCache.get(key)!;
    assetCacheBytes -= previous.result.body.byteLength;
  }
  assetCache.set(key, { at: Date.now(), result });
  assetCacheBytes += result.body.byteLength;
  while (assetCacheBytes > ASSET_CACHE_MAX_BYTES || assetCache.size > 200) {
    const oldestKey = assetCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = assetCache.get(oldestKey);
    assetCache.delete(oldestKey);
    if (oldest) assetCacheBytes -= oldest.result.body.byteLength;
  }
}

function parseHeaderFile(source: string): { status: number; statusText: string; headers: Headers } {
  const blocks = source.split(/\r?\n\r?\n/).filter((block) => /^HTTP\/\S+\s+\d+/i.test(block.trim()));
  const block = blocks.at(-1) ?? source;
  const lines = block.split(/\r?\n/);
  const statusLine = lines.shift() ?? "HTTP/1.1 502 Bad Gateway";
  const match = statusLine.match(/^HTTP\/\S+\s+(\d{3})\s*(.*)$/i);
  const status = match ? Number(match[1]) : 502;
  const statusText = match?.[2] ?? "Bad Gateway";
  const headers = new Headers();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key || /^content-length$/i.test(key)) continue;
    try {
      headers.append(key, value);
    } catch {
      // ignore malformed headers
    }
  }
  return { status, statusText, headers };
}

async function curlRequest(
  target: string,
  method: string,
  headers: Headers,
  body: Uint8Array | null,
): Promise<UpstreamResult> {
  const id = randomUUID();
  const headerFile = path.join(tmpdir(), `see-curl-${id}.headers`);
  const bodyFile = body ? path.join(tmpdir(), `see-curl-${id}.body`) : null;

  if (bodyFile && body) await writeFile(bodyFile, body);

  const args = [
    "-sS",
    "--compressed",
    "--max-time",
    "45",
    "--connect-timeout",
    "12",
    "--request",
    method,
    "--dump-header",
    headerFile,
    "--output",
    "-",
    "--url",
    target,
  ];

  headers.forEach((value, name) => {
    args.push("--header", `${name}: ${value}`);
  });
  if (bodyFile) args.push("--data-binary", `@${bodyFile}`);

  try {
    const proc = Bun.spawn([process.env.CURL_BIN || "curl", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    let headerSource = "";
    try {
      headerSource = await readFile(headerFile, "utf8");
    } catch {
      headerSource = "";
    }
    if (exitCode !== 0 && !headerSource) {
      throw new Error(stderr.trim() || `curl exited with ${exitCode}`);
    }
    const parsed = parseHeaderFile(headerSource);
    return {
      ...parsed,
      body: new Uint8Array(stdout),
    };
  } finally {
    await Promise.all([
      rm(headerFile, { force: true }).catch(() => undefined),
      bodyFile ? rm(bodyFile, { force: true }).catch(() => undefined) : Promise.resolve(),
    ]);
  }
}

/**
 * Cloudflare in front of www.themoviedb.org rejects Bun/Node's TLS
 * fingerprint with a challenge. curl's fingerprint is accepted, so the proxy
 * uses a small curl transport. Static assets are cached in memory.
 */
export async function requestTmdb(request: Request, target: string): Promise<UpstreamResult> {
  const method = request.method.toUpperCase();
  const cacheKey = `${method}:${target}`;
  if (method === "GET") {
    const cached = assetCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ASSET_CACHE_TTL) return cached.result;
  }

  const headers = new Headers();
  headers.forEach((value, name) => {
    if (!FORWARD_HEADERS.has(name.toLowerCase())) return;
    headers.set(name, value);
  });
  if (!headers.has("user-agent")) headers.set("user-agent", DEFAULT_UA);
  if (!headers.has("accept")) {
    headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  }
  const referer = headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      headers.set("referer", `https://www.themoviedb.org${url.pathname}${url.search}`);
    } catch {
      headers.delete("referer");
    }
  }
  const origin = headers.get("origin");
  if (origin) headers.set("origin", "https://www.themoviedb.org");

  let body: Uint8Array | null = null;
  if (!["GET", "HEAD"].includes(method) && request.body) {
    body = new Uint8Array(await new Response(request.body).arrayBuffer());
  }

  let result: UpstreamResult;
  try {
    result = await curlRequest(target, method, headers, body);
  } catch (error) {
    logger.warn("TMDB curl transport failed", {
      target,
      error: error instanceof Error ? error.message : String(error),
    });
    // Last resort: Bun fetch. Usually challenged by Cloudflare, but keep a
    // fallback for environments where curl is missing.
    const response = await fetch(target, {
      method,
      headers,
      body: body ? new Blob([body as unknown as BlobPart]) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(45_000),
    });
    result = {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
      body: new Uint8Array(await response.arrayBuffer()),
    };
  }

  result.headers.delete("content-encoding");
  result.headers.delete("content-length");
  result.headers.delete("transfer-encoding");
  if (method === "GET") cacheAsset(cacheKey, result);
  return result;
}

export function clearAssetCache(): void {
  assetCache.clear();
  assetCacheBytes = 0;
}
