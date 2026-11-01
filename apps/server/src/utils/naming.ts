export const MOVIE_LIBRARY_FOLDER = "Movies";
export const SERIES_LIBRARY_FOLDER = "TV Shows";

const ILLEGAL_CHARACTERS = /[<>"/\\|?*\u0000-\u001f]/g;

/**
 * Normalize a title for Jellyfin. Jellyfin recommends "Name (Year)" folders
 * with spaces preserved. Only filesystem-hostile characters are removed.
 */
export function sanitizeJellyfinName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/:/g, " - ")
    .replace(ILLEGAL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");
  return cleaned || "Unknown";
}

export function movieFolderName(name: string, year: string): string {
  const title = sanitizeJellyfinName(name);
  return year ? `${title} (${year})` : title;
}

export function movieSavePath(name: string, year: string): string {
  return `${MOVIE_LIBRARY_FOLDER}/${movieFolderName(name, year)}`;
}

export function seriesFolderName(name: string, year: string): string {
  const title = sanitizeJellyfinName(name);
  return year ? `${title} (${year})` : title;
}

export function seasonFolderName(season: number): string {
  return `Season ${String(Math.max(0, Math.trunc(season))).padStart(2, "0")}`;
}

export function seriesSavePath(name: string, year: string, season: number): string {
  return `${SERIES_LIBRARY_FOLDER}/${seriesFolderName(name, year)}/${seasonFolderName(season)}`;
}

/**
 * A per-episode folder inside the season directory. Jellyfin supports an
 * episode folder containing one or more versions of that episode, and this
 * keeps separate torrents from overwriting shared sample/subtitle names.
 */
export function seriesEpisodeFolderName(
  name: string,
  year: string,
  season: number,
  episode: number,
): string {
  return `${seriesFolderName(name, year)} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

export function joinSavePath(base: string, relative: string): string {
  if (!base) return "";
  const cleanBase = base.replace(/\/+$/, "");
  return relative ? `${cleanBase}/${relative}` : cleanBase;
}
