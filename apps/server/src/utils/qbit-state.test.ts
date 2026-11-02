import { describe, expect, test } from "bun:test";
import { isQbitComplete, isQbitPaused, qbitStateLabel } from "@tmdb-see/shared";

describe("qBittorrent state handling", () => {
  test("treats qBittorrent 5 stopped states as paused", () => {
    expect(isQbitPaused("stoppedDL")).toBe(true);
    expect(isQbitPaused("stoppedUP")).toBe(true);
  });

  test("still treats legacy paused states as paused", () => {
    expect(isQbitPaused("pausedDL")).toBe(true);
    expect(isQbitPaused("pausedUP")).toBe(true);
  });

  test("does not treat running states as paused", () => {
    expect(isQbitPaused("downloading")).toBe(false);
    expect(isQbitPaused("stalledDL")).toBe(false);
    expect(isQbitPaused("uploading")).toBe(false);
    expect(isQbitPaused("")).toBe(false);
    expect(isQbitPaused(undefined)).toBe(false);
  });

  test("labels both paused and stopped states", () => {
    expect(qbitStateLabel("stoppedDL")).toBe("Paused");
    expect(qbitStateLabel("stoppedUP")).toBe("Paused (seed)");
  });

  test("counts stopped completed torrents as complete", () => {
    expect(isQbitComplete({ state: "stoppedUP", progress: 1 })).toBe(true);
    expect(isQbitComplete({ state: "stoppedUP", progress: 0.99 })).toBe(true);
    expect(isQbitComplete({ state: "stoppedDL", progress: 0.5 })).toBe(false);
  });
});
