import type {
  AiMatch,
  AiStatus,
  AiVerifyItem,
  AiVerifyResult,
  MediaTarget,
  ProviderHealth,
} from "@tmdb-see/shared";
import { getAiCache, setAiCache } from "../db/ai-cache";
import { makeCacheKey } from "../lib/crypto";
import { recordEvent } from "./events";
import { getPrivateSettings } from "./settings";

interface CachedVerdict extends AiMatch {
  at: number;
  model: string;
}

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function baseUrl(value: string): string {
  return value.replace(/\/$/, "").replace(/\/api$/, "");
}

function targetKey(target: MediaTarget): string {
  return [
    target.type,
    target.title.toLowerCase(),
    target.year ?? "",
    target.season ?? "",
    target.episode ?? "",
    target.quality ?? "",
  ].join("|");
}

function cacheKey(model: string, target: MediaTarget, title: string): string {
  return makeCacheKey(["ai", model, targetKey(target), title.toLowerCase()]);
}

function normalizeConfidence(value: unknown): number {
  let confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0;
  if (confidence > 1 && confidence <= 100) confidence /= 100;
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;
}

function clampReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";
  return reason.slice(0, 400);
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseTarget(target: MediaTarget): string {
  return JSON.stringify(
    {
      type: target.type,
      title: target.title,
      year: target.year || undefined,
      season: target.type === "tv" ? target.season : undefined,
      episode: target.type === "tv" ? target.episode : undefined,
      quality: target.quality || undefined,
    },
    null,
    2,
  );
}

const SYSTEM_PROMPT = `You are a strict media release verifier for a self-hosted downloader.
For each torrent release title, decide whether it is genuinely the requested movie or TV episode.

Rules:
- Match the exact title. Reject sequels, prequels, spin-offs, remakes, documentaries about the title, and unrelated films with similar words.
- If the target has a year and the release title contains a different year, reject it. Numbers that are part of the title (for example "1917" or "Blade Runner 2049") are not years.
- For TV: an episode release must match the requested season and episode. A full season pack matches any episode in that season. Reject other seasons.
- A release title may contain extra technical tags, release-group names, language markers, and resolution markers. Those are fine.
- Reject compilations and multi-movie packs unless they explicitly contain only the requested title.
- Quality alone is never a reason to reject a correct title.
- If you are uncertain, set match to false and use a lower confidence.

Return ONLY valid JSON in this exact shape:
{"results":[{"index":1,"match":true,"confidence":0.97,"reason":"Short explanation"}]}
Use each supplied index exactly once. confidence must be between 0 and 1.`;

async function callOllama(
  items: Array<{ index: number; title: string }>,
  target: MediaTarget,
  model: string,
  apiUrl: string,
  apiKey: string,
): Promise<Map<number, { match: boolean; confidence: number; reason: string }>> {
  const userPrompt = [
    "TARGET:",
    parseTarget(target),
    "",
    "RELEASES:",
    ...items.map((item) => `${item.index}. ${item.title}`),
  ].join("\n");

  const response = await fetch(`${baseUrl(apiUrl)}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${text.slice(0, 300)}`);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Ollama returned invalid JSON: ${text.slice(0, 200)}`);
  }

  const message = (payload.message ?? {}) as Record<string, unknown>;
  const content =
    typeof message.content === "string"
      ? message.content
      : typeof payload.response === "string"
        ? payload.response
        : "";
  if (!content) throw new Error("Ollama returned an empty message");

  const parsed = parseJsonContent(content) as Record<string, unknown> | null;
  if (!parsed) throw new Error("Ollama did not return parseable JSON");
  let results = Array.isArray(parsed.results) ? parsed.results : [];
  if (results.length === 0 && typeof parsed.match === "boolean" && items.length === 1) {
    results = [{ index: items[0].index, ...parsed }];
  }
  if (results.length === 0) throw new Error("Ollama response had no results array");

  const verdicts = new Map<number, { match: boolean; confidence: number; reason: string }>();
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const index = Number(record.index);
    if (!Number.isFinite(index)) continue;
    verdicts.set(Math.floor(index), {
      match: Boolean(record.match),
      confidence: normalizeConfidence(record.confidence),
      reason: clampReason(record.reason),
    });
  }
  return verdicts;
}

export function aiStatus(): AiStatus {
  const settings = getPrivateSettings();
  const needsKey = settings.ai.baseUrl.includes("ollama.com");
  return {
    enabled: settings.ai.enabled,
    configured: Boolean(
      settings.ai.baseUrl && settings.ai.model && (!needsKey || settings.ai.apiKey),
    ),
    baseUrl: settings.ai.baseUrl,
    model: settings.ai.model,
    verifyDownloads: settings.ai.verifyDownloads,
    verifyFollows: settings.ai.verifyFollows,
    threshold: settings.ai.threshold,
    health: null,
  };
}

export function shouldAutoVerify(kind: "downloads" | "follows"): boolean {
  const settings = getPrivateSettings();
  if (!settings.ai.enabled || !settings.ai.baseUrl || !settings.ai.model) return false;
  if (settings.ai.baseUrl.includes("ollama.com") && !settings.ai.apiKey) return false;
  return kind === "downloads" ? settings.ai.verifyDownloads : settings.ai.verifyFollows;
}

export async function verifyItems(target: MediaTarget, items: AiVerifyItem[]): Promise<AiVerifyResult[]> {
  const settings = getPrivateSettings();
  if (!settings.ai.enabled) throw new Error("AI is disabled in settings");
  if (!settings.ai.baseUrl || !settings.ai.model) throw new Error("AI is not configured");
  if (settings.ai.baseUrl.includes("ollama.com") && !settings.ai.apiKey) {
    throw new Error("Ollama Cloud API key is missing");
  }
  if (items.length === 0) return [];
  if (items.length > 12) throw new Error("At most 12 releases can be checked at once");

  const model = settings.ai.model;
  const results: Array<AiVerifyResult | null> = new Array(items.length).fill(null);
  const missing: Array<{ index: number; title: string }> = [];

  items.forEach((item, arrayIndex) => {
    const key = cacheKey(model, target, item.title);
    const cached = getAiCache<CachedVerdict>(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      results[arrayIndex] = {
        index: arrayIndex + 1,
        title: item.title,
        verified: cached.verified,
        confidence: cached.confidence,
        reason: cached.reason,
        cached: true,
        model: cached.model,
      };
    } else {
      missing.push({ index: arrayIndex + 1, title: item.title });
    }
  });

  if (missing.length > 0) {
    const verdicts = await callOllama(
      missing,
      target,
      model,
      settings.ai.baseUrl,
      settings.ai.apiKey,
    );
    for (const item of missing) {
      const verdict = verdicts.get(item.index);
      const arrayIndex = item.index - 1;
      const match: AiMatch = {
        verified: verdict?.match ?? false,
        confidence: verdict?.confidence ?? 0,
        reason: verdict?.reason || "The AI did not return a verdict for this release.",
        cached: false,
        model,
      };
      results[arrayIndex] = {
        index: item.index,
        title: item.title,
        ...match,
      };
      const cached: CachedVerdict = { ...match, at: Date.now(), model };
      setAiCache(cacheKey(model, target, item.title), cached);
    }
  }

  return results.map(
    (result, index) =>
      result ?? {
        index: index + 1,
        title: items[index].title,
        verified: false,
        confidence: 0,
        reason: "No verdict returned.",
        model,
      },
  );
}

export async function autoVerify(
  kind: "downloads" | "follows",
  target: MediaTarget,
  items: AiVerifyItem[],
): Promise<Map<string, AiMatch> | null> {
  if (!shouldAutoVerify(kind) || items.length === 0) return null;
  try {
    const results = await verifyItems(target, items);
    const map = new Map<string, AiMatch>();
    results.forEach((result, index) => {
      const source = items[index];
      map.set(source.id ? `${source.providerId ?? ""}:${source.id}` : source.title, {
        verified: result.verified,
        confidence: result.confidence,
        reason: result.reason,
        cached: result.cached,
        model: result.model,
      });
    });
    return map;
  } catch (error) {
    recordEvent("warning", "ai", "AI verification failed; using title heuristics", {
      error: error instanceof Error ? error.message : String(error),
      target: target.title,
    });
    return null;
  }
}

export function isVerified(match: AiMatch | null | undefined, threshold?: number): boolean {
  if (!match) return false;
  const cutoff = threshold ?? getPrivateSettings().ai.threshold;
  return match.verified && match.confidence >= cutoff;
}

export async function testAi(overrides?: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}): Promise<ProviderHealth> {
  const settings = getPrivateSettings();
  const base = baseUrl(overrides?.baseUrl || settings.ai.baseUrl);
  const key = overrides?.apiKey || settings.ai.apiKey;
  const model = overrides?.model || settings.ai.model;
  const started = Date.now();
  if (!base) {
    return {
      ok: false,
      message: "AI base URL is missing",
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }
  try {
    const response = await fetch(`${base}/api/tags`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Ollama ${response.status}: ${text.slice(0, 200)}`);
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error("Ollama returned invalid JSON");
    }
    const models = Array.isArray(data.models) ? data.models : [];
    const names = models
      .map((entry) =>
        entry && typeof entry === "object"
          ? String((entry as Record<string, unknown>).name ?? "")
          : "",
      )
      .filter(Boolean);
    const found = names.some((name) => name === model || name.startsWith(`${model}:`));
    return {
      ok: true,
      message: found
        ? `Connected. Model ${model} is available.`
        : `Connected to Ollama${names.length ? ` (${names.length} models)` : ""}. Model ${model} was not listed.`,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const health = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
    recordEvent("warning", "ai", "Ollama connection test failed", { error: health.message });
    return health;
  }
}
