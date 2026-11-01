import type { MovieDetails, TvSeason } from "@tmdb-see/shared";
import { config } from "../config";
import { ApiError } from "../lib/errors";
import { getPrivateSettings } from "./settings";
import { buildMovieSearchPattern } from "../utils/media";

type TmdbRecord = Record<string, unknown>;
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL = 5 * 60 * 1000;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}

function cached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.at > CACHE_TTL) return null;
  return entry.value as T;
}

function store<T>(key: string, value: T): T {
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function tmdbGet(pathname: string): Promise<TmdbRecord> {
  const settings = getPrivateSettings();
  if (!settings.tmdb.apiKey) {
    throw new ApiError(503, "TMDB API key is not configured. Add it in Settings → Connections.");
  }
  const url = new URL(`${config.tmdb.apiBase}${pathname}`);
  url.searchParams.set("api_key", settings.tmdb.apiKey);
  if (settings.tmdb.language) url.searchParams.set("language", settings.tmdb.language);
  const key = url.toString();
  const hit = cached<TmdbRecord>(key);
  if (hit) return hit;

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TMDB ${response.status}: ${text.slice(0, 200)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("TMDB returned invalid JSON");
  }
  if (!data || typeof data !== "object") throw new Error("TMDB returned an empty response");
  return store(key, data as TmdbRecord);
}

export async function getMovieDetails(tmdbId: number): Promise<MovieDetails> {
  const details = await tmdbGet(`/movie/${tmdbId}`);
  const name = asString(details.title).trim();
  if (!name) throw new Error(`TMDB movie ${tmdbId} has no title`);
  const releaseDate = asString(details.release_date);
  const year = releaseDate.slice(0, 4);
  return {
    tmdbId,
    name,
    year,
    releaseDate,
    posterPath: asString(details.poster_path) || undefined,
    searchPattern: buildMovieSearchPattern(name, year),
  };
}

export async function getMovieRaw(tmdbId: number): Promise<TmdbRecord> {
  return tmdbGet(`/movie/${tmdbId}`);
}

export interface SeriesDetails {
  name: string;
  year: string;
  posterPath: string;
  seasons: TvSeason[];
}

export async function getSeriesDetails(tmdbId: number): Promise<SeriesDetails> {
  const details = await tmdbGet(`/tv/${tmdbId}`);
  const name = asString(details.name).trim();
  if (!name) throw new Error(`TMDB series ${tmdbId} has no name`);
  const firstAirDate = asString(details.first_air_date);
  const rawSeasons = Array.isArray(details.seasons) ? details.seasons : [];
  const seasons: TvSeason[] = [];
  for (const value of rawSeasons) {
    if (!value || typeof value !== "object") continue;
    const season = value as TmdbRecord;
    const seasonNumber = asNumber(season.season_number);
    if (seasonNumber < 1) continue;
    seasons.push({
      season_number: seasonNumber,
      episode_count: asNumber(season.episode_count),
      name: asString(season.name) || `Season ${seasonNumber}`,
      air_date: asString(season.air_date) || undefined,
      poster_path: asString(season.poster_path) || undefined,
    });
  }
  seasons.sort((a, b) => a.season_number - b.season_number);
  return {
    name,
    year: firstAirDate.slice(0, 4),
    posterPath: asString(details.poster_path),
    seasons,
  };
}

export async function getSeriesSeasons(tmdbId: number): Promise<TvSeason[]> {
  return (await getSeriesDetails(tmdbId)).seasons;
}

export function tmdbConfigured(): boolean {
  return Boolean(getPrivateSettings().tmdb.apiKey);
}

export async function testTmdb(): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
  checkedAt: string;
}> {
  const started = Date.now();
  try {
    const settings = getPrivateSettings();
    if (!settings.tmdb.apiKey) throw new Error("TMDB API key is missing");
    const response = await fetch(`${config.tmdb.apiBase}/configuration?api_key=${encodeURIComponent(settings.tmdb.apiKey)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`TMDB ${response.status}: ${text.slice(0, 200)}`);
    return {
      ok: true,
      message: "Connected to TMDB API",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
  }
}
