import { describe, expect, test } from "bun:test";
import { episodeLabel, parseEpisodeFromTitle } from "./episode";

describe("episode parsing", () => {
  test("parses SxxExx", () => {
    expect(parseEpisodeFromTitle("Show.Name.S01E02.1080p.WEB")).toEqual({
      season: 1,
      episode: 2,
      raw: "S01E02",
    });
  });

  test("parses alternate separators and 1x02", () => {
    expect(parseEpisodeFromTitle("Show Name s2.e10 720p")?.episode).toBe(10);
    expect(parseEpisodeFromTitle("Show Name 3x07")?.season).toBe(3);
    expect(parseEpisodeFromTitle("Show Name 3x07")?.episode).toBe(7);
  });

  test("parses season packs", () => {
    expect(parseEpisodeFromTitle("Show.Name.S04.1080p.BluRay")).toEqual({
      season: 4,
      episode: 0,
      raw: "S04",
    });
    expect(parseEpisodeFromTitle("Show Name Season 2 COMPLETE")?.episode).toBe(0);
  });

  test("returns null for non-episodes", () => {
    expect(parseEpisodeFromTitle("Fight.Club.1999.1080p")).toBeNull();
  });

  test("labels episodes and packs", () => {
    expect(episodeLabel(1, 2)).toBe("S01E02");
    expect(episodeLabel(3, 0)).toBe("S03 pack");
  });
});
