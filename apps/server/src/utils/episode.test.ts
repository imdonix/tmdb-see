import { describe, expect, test } from "bun:test";
import { episodeLabel, parseEpisodeFromTitle, seasonPackLabel } from "./episode";

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

  test("parses complete-series ranges", () => {
    expect(parseEpisodeFromTitle("Mr.Robot.S01-S04.COMPLETE.1080p.BluRay")).toEqual({
      season: 1,
      episode: 0,
      seasonEnd: 4,
      raw: "S01-S04",
    });
    expect(parseEpisodeFromTitle("Show.Name.S1-3.720p")?.seasonEnd).toBe(3);
    expect(parseEpisodeFromTitle("Show.Name.S01-04.WEB")?.seasonEnd).toBe(4);
    expect(parseEpisodeFromTitle("Show Name Seasons 2-5 1080p")).toEqual({
      season: 2,
      episode: 0,
      seasonEnd: 5,
      raw: "Seasons 2-5",
    });
    expect(parseEpisodeFromTitle("Show Name Season 1 to Season 3")?.seasonEnd).toBe(3);
  });

  test("does not treat episode ranges as season ranges", () => {
    const parsed = parseEpisodeFromTitle("Show.Name.S01E02-E03.1080p");
    expect(parsed?.season).toBe(1);
    expect(parsed?.episode).toBe(2);
    expect(parsed?.seasonEnd).toBeUndefined();
  });

  test("flags complete-series collections without a range", () => {
    expect(parseEpisodeFromTitle("Mr.Robot.Complete.Series.1080p")?.complete).toBe(true);
    expect(parseEpisodeFromTitle("Mr.Robot.Complete.Series.1080p")?.episode).toBe(0);
  });

  test("does not treat a single season as a range", () => {
    expect(parseEpisodeFromTitle("Show.Name.S03.1080p")?.seasonEnd).toBeUndefined();
  });

  test("returns null for non-episodes", () => {
    expect(parseEpisodeFromTitle("Fight.Club.1999.1080p")).toBeNull();
  });

  test("labels episodes and packs", () => {
    expect(episodeLabel(1, 2)).toBe("S01E02");
    expect(episodeLabel(3, 0)).toBe("S03 pack");
    expect(seasonPackLabel(1, 4)).toBe("S01-S04");
    expect(seasonPackLabel(2, 2)).toBe("S02");
  });
});
