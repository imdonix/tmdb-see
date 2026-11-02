export interface ParsedRelease {
  season: number;
  episode: number;
  raw: string;
  /** Inclusive last season for multi-season packs such as S01-S04. */
  seasonEnd?: number;
  /** Release is explicitly a complete-series collection without a range. */
  complete?: boolean;
}

const SEASON_EPISODE = /S(\d{1,2})\s*[. _-]*E(\d{1,3})/i;
const SEASON_X = /\b(\d{1,2})x(\d{1,3})\b/i;
// S01-S04, S1-S4, S01-04, S01 - S04
const SEASON_RANGE = /\bS(\d{1,2})\s*[-–—~]\s*S?(\d{1,2})\b/i;
// Seasons 1-4, Season 1 to Season 4
const SEASON_WORD_RANGE = /\bSeasons?\s*(\d{1,2})\s*(?:[-–—~]|to)\s*(?:Seasons?\s*)?(\d{1,2})\b/i;
const SEASON_ONLY = /(?:^|[^A-Za-z0-9])S(\d{1,2})(?:[^A-Za-z0-9]|$)/i;
const SEASON_WORD = /Seasons?[.\s]*(\d{1,2})/i;
const COMPLETE_SERIES =
  /\b(?:complete[.\s_-]+(?:series|collection|show)|(?:series|show)[.\s_-]+complete|the[.\s_-]+complete[.\s_-]+(?:series|collection))\b/i;

function rangeCandidate(title: string, pattern: RegExp): ParsedRelease | null {
  const match = title.match(pattern);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start <= 0 || end <= 0 || end <= start) return null;
  return {
    season: start,
    episode: 0,
    seasonEnd: end,
    raw: match[0].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""),
  };
}

export function parseEpisodeFromTitle(title: string): ParsedRelease | null {
  const episodeMatch = title.match(SEASON_EPISODE);
  if (episodeMatch) {
    const season = Number(episodeMatch[1]);
    const episode = Number(episodeMatch[2]);
    if (season > 0 && episode > 0) return { season, episode, raw: episodeMatch[0] };
  }

  const xMatch = title.match(SEASON_X);
  if (xMatch) {
    const season = Number(xMatch[1]);
    const episode = Number(xMatch[2]);
    if (season > 0 && episode > 0) return { season, episode, raw: xMatch[0] };
  }

  // Multi-season packs must be checked before single-season matches, otherwise
  // "Mr.Robot.S01-S04.COMPLETE" is mistaken for a season 1 pack.
  const range = rangeCandidate(title, SEASON_RANGE) ?? rangeCandidate(title, SEASON_WORD_RANGE);
  if (range) return range;

  const seasonOnly = title.match(SEASON_ONLY);
  if (seasonOnly) {
    const season = Number(seasonOnly[1]);
    if (season > 0) {
      return {
        season,
        episode: 0,
        raw: seasonOnly[0].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""),
      };
    }
  }

  const seasonWord = title.match(SEASON_WORD);
  if (seasonWord && !title.toLowerCase().includes("episode")) {
    const season = Number(seasonWord[1]);
    if (season > 0) return { season, episode: 0, raw: seasonWord[0] };
  }

  const complete = title.match(COMPLETE_SERIES);
  if (complete) {
    return { season: 1, episode: 0, complete: true, raw: complete[0] };
  }

  return null;
}

export function episodeLabel(season: number, episode: number): string {
  if (episode <= 0) return `S${String(season).padStart(2, "0")} pack`;
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

export function seasonPackLabel(season: number, seasonEnd: number | undefined): string {
  if (seasonEnd && seasonEnd > season) {
    return `S${String(season).padStart(2, "0")}-S${String(seasonEnd).padStart(2, "0")}`;
  }
  return `S${String(season).padStart(2, "0")}`;
}
