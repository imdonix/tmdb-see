import { WIDGET_TAG } from "@tmdb-see/shared";
import type { QbitRef } from "@tmdb-see/shared";

export const SEE_PROVIDER_PREFIX = "see:";
export const LEGACY_NCORE_PREFIX = "ncore:";

export function providerTag(providerId: string, torrentId: string): string {
  return `${SEE_PROVIDER_PREFIX}${providerId}:${torrentId}`;
}

export function buildQbitTags(input: {
  providerId: string;
  torrentId: string;
  tmdbId?: number;
  mediaType?: "movie" | "tv";
  followId?: number;
  season?: number;
  episode?: number;
  extra?: string[];
}): string {
  const tags = new Set<string>([WIDGET_TAG, providerTag(input.providerId, input.torrentId)]);
  if (input.tmdbId) {
    tags.add(input.mediaType === "tv" ? `show:${input.tmdbId}` : `movie:${input.tmdbId}`);
  }
  if (input.followId) tags.add(`follow:${input.followId}`);
  if (input.season !== undefined) tags.add(`season:${input.season}`);
  if (input.episode !== undefined) tags.add(`episode:${input.episode}`);
  for (const tag of input.extra ?? []) if (tag.trim()) tags.add(tag.trim());
  return [...tags].join(", ");
}

export function parseQbitRef(tags: string): QbitRef {
  const ref: QbitRef = {};
  for (const raw of tags.split(",")) {
    const tag = raw.trim();
    if (tag.startsWith(SEE_PROVIDER_PREFIX)) {
      const remainder = tag.slice(SEE_PROVIDER_PREFIX.length);
      const separator = remainder.indexOf(":");
      if (separator > 0) {
        ref.providerId = remainder.slice(0, separator);
        ref.torrentId = remainder.slice(separator + 1);
      }
    } else if (tag.startsWith(LEGACY_NCORE_PREFIX)) {
      ref.providerId = "ncore";
      ref.torrentId = tag.slice(LEGACY_NCORE_PREFIX.length);
    } else if (tag.startsWith("movie:")) {
      ref.mediaType = "movie";
      ref.tmdbId = Number(tag.slice(6));
    } else if (tag.startsWith("show:")) {
      ref.mediaType = "tv";
      ref.tmdbId = Number(tag.slice(5));
    } else if (tag.startsWith("follow:")) {
      ref.followId = Number(tag.slice(7));
    } else if (tag.startsWith("season:")) {
      ref.season = Number(tag.slice(7));
    } else if (tag.startsWith("episode:")) {
      ref.episode = Number(tag.slice(8));
    }
  }
  return ref;
}

export function torrentFilename(title: string, fallback: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, ".")
    .trim()
    .slice(0, 160);
  return `${cleaned || fallback}.torrent`;
}
