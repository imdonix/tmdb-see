import { describe, expect, test } from "bun:test";
import { humanSize, parseSize } from "./size";

describe("size parsing", () => {
  test("parses binary and decimal units", () => {
    expect(parseSize("1.5 GiB")).toBe(Math.round(1.5 * 1024 ** 3));
    expect(parseSize("1.5 GB")).toBe(1_500_000_000);
    expect(parseSize("700 MiB")).toBe(700 * 1024 ** 2);
    expect(parseSize(2048)).toBe(2048);
  });

  test("returns undefined for junk", () => {
    expect(parseSize("unknown")).toBeUndefined();
    expect(parseSize(null)).toBeUndefined();
  });

  test("formats sizes", () => {
    expect(humanSize(1024)).toBe("1.0 KiB");
    expect(humanSize(0)).toBe("—");
  });
});
