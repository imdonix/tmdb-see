import { describe, expect, test } from "bun:test";
import {
  joinSavePath,
  movieFolderName,
  movieSavePath,
  seasonFolderName,
  seriesEpisodeFolderName,
  seriesFolderName,
  seriesSavePath,
} from "./naming";

describe("Jellyfin naming", () => {
  test("builds standard movie folders", () => {
    expect(movieFolderName("Fight Club", "1999")).toBe("Fight Club (1999)");
    expect(movieFolderName("Widow's Bay", "2026")).toBe("Widow's Bay (2026)");
    expect(movieSavePath("Fight Club", "1999")).toBe("Movies/Fight Club (1999)");
  });

  test("builds standard series paths", () => {
    expect(seriesFolderName("The Office", "2005")).toBe("The Office (2005)");
    expect(seasonFolderName(2)).toBe("Season 02");
    expect(seriesSavePath("The Office", "2005", 2)).toBe(
      "TV Shows/The Office (2005)/Season 02",
    );
    expect(seriesSavePath("The Office", "2005", 10)).toBe(
      "TV Shows/The Office (2005)/Season 10",
    );
    expect(seriesEpisodeFolderName("The Office", "2005", 2, 3)).toBe(
      "The Office (2005) S02E03",
    );
  });

  test("removes filesystem-hostile characters but preserves readable titles", () => {
    expect(movieFolderName("Mission: Impossible", "1996")).toBe(
      "Mission - Impossible (1996)",
    );
    expect(movieFolderName("What?", "2024")).toBe("What (2024)");
    expect(movieFolderName("Foo/Bar", "2024")).toBe("Foo Bar (2024)");
    expect(movieFolderName("  Trailing dots...  ", "2024")).toBe(
      "Trailing dots (2024)",
    );
  });

  test("only prepends the base when configured", () => {
    expect(joinSavePath("", "Movies/Film (2020)")).toBe("");
    expect(joinSavePath("/downloads/", "Movies/Film (2020)")).toBe(
      "/downloads/Movies/Film (2020)",
    );
  });
});
