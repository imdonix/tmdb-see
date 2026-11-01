import { describe, expect, test } from "bun:test";
import { buildQbitTags, parseQbitRef, providerTag, torrentFilename } from "./qbit-tags";

describe("qBittorrent tags", () => {
  test("builds and parses provider references", () => {
    const tags = buildQbitTags({
      providerId: "ncore",
      torrentId: "3815771",
      tmdbId: 550,
      mediaType: "movie",
    });
    expect(tags).toContain("tmdb-see");
    expect(tags).toContain("see:ncore:3815771");
    expect(tags).toContain("movie:550");
    expect(parseQbitRef(tags)).toMatchObject({
      providerId: "ncore",
      torrentId: "3815771",
      mediaType: "movie",
      tmdbId: 550,
    });
  });

  test("supports legacy ncore tags", () => {
    expect(parseQbitRef("ncore:12345")).toMatchObject({ providerId: "ncore", torrentId: "12345" });
  });

  test("supports TV episode tags", () => {
    const tags = buildQbitTags({
      providerId: "prowlarr",
      torrentId: "abc",
      tmdbId: 1399,
      mediaType: "tv",
      followId: 2,
      season: 1,
      episode: 4,
    });
    expect(parseQbitRef(tags)).toMatchObject({
      providerId: "prowlarr",
      torrentId: "abc",
      mediaType: "tv",
      followId: 2,
      season: 1,
      episode: 4,
    });
  });

  test("creates safe torrent file names", () => {
    expect(torrentFilename('Foo/Bar: "Baz"', "fallback")).toBe("FooBar.Baz.torrent");
    expect(providerTag("x", "y")).toBe("see:x:y");
  });
});
