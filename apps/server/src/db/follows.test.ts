import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "see-follow-test-"));
process.env.DISABLE_SCHEDULER = "1";

const { closeDatabase } = await import("./index");
const {
  deleteFollowRow,
  ensureWantedEpisodeRows,
  followCounts,
  getFollowRow,
  getFollowRowByTmdb,
  insertFollow,
  listFollowItemRows,
  markEpisodesCoveredBy,
  markSeasonSkipped,
  unskipSeason,
  upsertFollowItemRow,
} = await import("./follows");

afterAll(() => closeDatabase());

describe("follow repository", () => {
  test("seeds episodes, applies skips, and restores them", () => {
    const follow = insertFollow({
      tmdbId: 12345,
      name: "Test Show",
      year: "2026",
      quality: "1080p",
      searchPattern: "test show",
      status: "active",
      posterPath: "/poster.jpg",
      skippedSeasons: [2],
    });

    ensureWantedEpisodeRows(follow.id, 1, 3);
    ensureWantedEpisodeRows(follow.id, 2, 3);
    markSeasonSkipped(follow.id, 2, 3);

    let items = listFollowItemRows(follow.id);
    expect(items.filter((item) => item.season === 2 && item.status === "skipped")).toHaveLength(4);
    expect(items.find((item) => item.season === 2 && item.episode === 2)?.status).toBe("skipped");
    expect(items.find((item) => item.season === 1 && item.episode === 2)?.status).toBe("wanted");

    const byTmdb = getFollowRowByTmdb(12345);
    expect(byTmdb).not.toBeNull();
    expect(followCounts(byTmdb!)).toMatchObject({ wanted: 3, total: 7 });

    unskipSeason(follow.id, 2);
    items = listFollowItemRows(follow.id);
    expect(items.some((item) => item.season === 2 && item.episode === 0)).toBe(false);
    expect(items.filter((item) => item.season === 2).every((item) => item.status === "wanted")).toBe(true);

    deleteFollowRow(follow.id);
    expect(getFollowRow(follow.id)).toBeNull();
  });

  test("preserves an actively downloading episode when a season is skipped", () => {
    const follow = insertFollow({
      tmdbId: 67890,
      name: "Another Show",
      year: "2025",
      quality: "720p",
      searchPattern: "another show",
      status: "active",
      posterPath: "",
      skippedSeasons: [],
    });
    ensureWantedEpisodeRows(follow.id, 1, 2);
    upsertFollowItemRow({
      followId: follow.id,
      season: 1,
      episode: 1,
      status: "downloading",
      providerId: "ncore",
      torrentId: "111",
      torrentTitle: "Another.Show.S01E01.720p",
      qbitHash: "abc",
    });
    markSeasonSkipped(follow.id, 1, 2);
    const items = listFollowItemRows(follow.id);
    expect(items.find((item) => item.episode === 1)?.status).toBe("downloading");
    expect(items.find((item) => item.episode === 2)?.status).toBe("skipped");
    deleteFollowRow(follow.id);
  });

  test("can mark episodes covered by a season pack", () => {
    const follow = insertFollow({
      tmdbId: 24680,
      name: "Pack Show",
      year: "2024",
      quality: "1080p",
      searchPattern: "pack show",
      status: "active",
      posterPath: "",
      skippedSeasons: [],
    });
    ensureWantedEpisodeRows(follow.id, 1, 3);
    const pack = upsertFollowItemRow({
      followId: follow.id,
      season: 1,
      episode: 0,
      status: "downloading",
      providerId: "ncore",
      torrentId: "999",
    });
    markEpisodesCoveredBy(follow.id, 1, pack.id);
    const items = listFollowItemRows(follow.id);
    expect(items.filter((item) => item.episode > 0).every((item) => item.status === "completed")).toBe(true);
    expect(items.filter((item) => item.episode > 0).every((item) => item.covered_by === pack.id)).toBe(true);
    deleteFollowRow(follow.id);
  });
});
