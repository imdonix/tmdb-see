import type { Quality } from "@tmdb-see/shared";

const YEAR_RE = /\b(19\d{2}|20\d{2})\b/g;

export function detectResolution(title: string): Quality | "" {
  const value = title.toLowerCase();
  if (value.includes("2160p") || value.includes("4k") || value.includes("uhd")) return "2160p";
  if (
    value.includes("1080p") ||
    value.includes("1080i") ||
    value.includes("fullhd") ||
    value.includes("full.hd") ||
    value.includes("full hd")
  ) {
    return "1080p";
  }
  if (value.includes("720p")) return "720p";
  if (value.includes("480p") || value.includes("576p")) return "480p";
  if (
    value.includes("xvid") ||
    value.includes("dvdrip") ||
    value.includes("dvd") ||
    value.includes("sdtv")
  ) {
    return "SD";
  }
  return "";
}

export function matchesQuality(title: string, quality: string): boolean {
  const value = title.toLowerCase();
  const requested = quality.toLowerCase();
  const has2160 = value.includes("2160p") || value.includes("4k") || value.includes("uhd");
  const has1080 =
    value.includes("1080p") ||
    value.includes("1080i") ||
    value.includes("fullhd") ||
    value.includes("full.hd");
  const has720 = value.includes("720p");

  if (requested === "2160p") return has2160;
  if (requested === "1080p") return has1080 && !has2160;
  if (requested === "720p") return has720 && !has1080 && !has2160;
  return true;
}

export function isCamRelease(title: string): boolean {
  const value = `.${title.toLowerCase()}.`;
  return [
    "hdcam",
    "camrip",
    "telesync",
    "telecine",
    "dvdscr",
    "screener",
    ".cam.",
    ".ts.",
    ".tc.",
  ].some((marker) => value.includes(marker));
}

export function normalizeLoose(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function titleLooksLikeContent(title: string, name: string): boolean {
  const normalizedTitle = normalizeLoose(title);
  const normalizedName = normalizeLoose(name);
  if (!normalizedName) return true;
  const tokens = normalizedName.split(" ").filter((token) => token.length >= 2);
  return tokens.every((token) => normalizedTitle.includes(token));
}

export function titleLooksLikeSeries(title: string, seriesName: string): boolean {
  return titleLooksLikeContent(title, seriesName);
}

export function extractYears(value: string): string[] {
  return [...value.matchAll(new RegExp(YEAR_RE))].map((match) => match[1]);
}

export function movieYearMatches(title: string, name: string, year: string): boolean {
  if (!year) return true;
  const titleYears = extractYears(title);
  if (titleYears.length === 0) return true;
  if (titleYears.includes(year)) return true;
  const nameYears = extractYears(name);
  return nameYears.some((nameYear) => titleYears.includes(nameYear));
}

export function buildMovieSearchPattern(name: string, year?: string): string {
  return normalizeLoose(`${name} ${year ?? ""}`);
}

export function buildSeriesSearchPattern(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,:;!@#$%^&*()+=[\]{}|\\/"'<>?~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
