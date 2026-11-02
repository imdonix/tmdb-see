import { describe, expect, test } from "bun:test";
import { extractApiKey, keysMatch } from "./api-key";

describe("api key helpers", () => {
  test("accepts only the exact key", () => {
    expect(keysMatch("test-api-key", "test-api-key")).toBe(true);
    expect(keysMatch("test-api-ke", "test-api-key")).toBe(false);
    expect(keysMatch("TEST-API-KEY", "test-api-key")).toBe(false);
    expect(keysMatch("", "test-api-key")).toBe(false);
    expect(keysMatch(null, "test-api-key")).toBe(false);
    expect(keysMatch(undefined, "test-api-key")).toBe(false);
  });

  test("reads a Bearer token", () => {
    const headers = new Headers({ authorization: "Bearer test-api-key" });
    expect(extractApiKey(headers, new URL("http://localhost/api/overview"))).toBe("test-api-key");
  });

  test("reads X-API-Key", () => {
    const headers = new Headers({ "x-api-key": "test-api-key" });
    expect(extractApiKey(headers, new URL("http://localhost/api/overview"))).toBe("test-api-key");
  });

  test("reads the key query parameter for anchor downloads", () => {
    const headers = new Headers();
    expect(extractApiKey(headers, new URL("http://localhost/api/torrents/a/b/file?key=test-api-key"))).toBe(
      "test-api-key",
    );
  });

  test("returns an empty string when no key is supplied", () => {
    expect(extractApiKey(new Headers(), new URL("http://localhost/api/overview"))).toBe("");
  });
});
