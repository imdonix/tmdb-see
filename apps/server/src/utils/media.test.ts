import { describe, expect, test } from "bun:test";
import {
  buildMovieSearchPattern,
  buildSeriesSearchPattern,
  detectResolution,
  isCamRelease,
  matchesQuality,
  movieYearMatches,
  titleLooksLikeContent,
} from "./media";

describe("resolution detection", () => {
  test("detects common resolution markers", () => {
    expect(detectResolution("Fight.Club.1999.2160p.UHD.BluRay")).toBe("2160p");
    expect(detectResolution("Fight.Club.1999.1080p.BluRay")).toBe("1080p");
    expect(detectResolution("Fight.Club.1999.720p.WEB")).toBe("720p");
    expect(detectResolution("Fight.Club.1999.DVDRip.XviD")).toBe("SD");
    expect(detectResolution("Fight.Club.1999")).toBe("");
  });

  test("does not treat a higher resolution as the requested one", () => {
    expect(matchesQuality("Movie.2160p", "1080p")).toBe(false);
    expect(matchesQuality("Movie.1080p", "720p")).toBe(false);
    expect(matchesQuality("Movie.1080p", "1080p")).toBe(true);
    expect(matchesQuality("Movie.720p", "720p")).toBe(true);
  });

  test("detects cam and screener releases", () => {
    expect(isCamRelease("Movie.2025.HDCAM.x264")).toBe(true);
    expect(isCamRelease("Movie.2025.DVDSCR.x264")).toBe(true);
    expect(isCamRelease("Movie.2025.1080p.BluRay")).toBe(false);
  });
});

describe("title and year matching", () => {
  test("checks every meaningful title token", () => {
    expect(titleLooksLikeContent("The.Matrix.1999.1080p", "The Matrix")).toBe(true);
    expect(titleLooksLikeContent("Matrix.Reloaded.2003", "The Matrix")).toBe(false);
  });

  test("rejects remakes with a different year", () => {
    expect(movieYearMatches("The.Thing.1982.1080p", "The Thing", "2011")).toBe(false);
    expect(movieYearMatches("The.Thing.2011.1080p", "The Thing", "2011")).toBe(true);
    expect(movieYearMatches("Blade.Runner.2049.2017.1080p", "Blade Runner 2049", "2017")).toBe(true);
  });

  test("normalizes movie and series patterns", () => {
    expect(buildMovieSearchPattern("Fight Club", "1999")).toBe("fight club 1999");
    expect(buildSeriesSearchPattern("Widow's Bay")).toBe("widows bay");
    expect(buildSeriesSearchPattern("The Office (US)")).toBe("the office us");
  });
});
