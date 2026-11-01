export interface ParsedRelease {
  season: number;
  episode: number;
  raw: string;
}

const SEASON_EPISODE = /S(\d{1,2})\s*[. _-]*E(\d{1,3})/i;
const SEASON_X = /\b(\d{1,2})x(\d{1,3})\b/i;
const SEASON_ONLY = /(?:^|[^A-Za-z0-9])S(\d{1,2})(?:[^A-Za-z0-9]|$)/i;
const SEASON_WORD = /Season[.\s]*(\d{1,2})/i;

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

  return null;
}

export function episodeLabel(season: number, episode: number): string {
  if (episode <= 0) return `S${String(season).padStart(2, "0")} pack`;
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}
