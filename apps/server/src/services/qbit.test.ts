import { describe, expect, test } from "bun:test";
import { sessionCookie } from "./qbit";

describe("qBittorrent session cookie", () => {
  test("reads the legacy SID cookie", () => {
    expect(sessionCookie(["SID=abc123; HttpOnly; path=/"])).toBe("SID=abc123");
  });

  test("reads the qBittorrent 5 port-suffixed cookie", () => {
    expect(
      sessionCookie(["QBT_SID_8080=SKjMasCnWXBGCXfFAJ9XsY3RBJZjTj6Z; HttpOnly; SameSite=Lax; path=/"]),
    ).toBe("QBT_SID_8080=SKjMasCnWXBGCXfFAJ9XsY3RBJZjTj6Z");
  });

  test("ignores unrelated cookies and picks the session one", () => {
    expect(sessionCookie(["theme=dark; path=/", "QBT_SID_8081=xyz; path=/"])).toBe("QBT_SID_8081=xyz");
  });

  test("returns an empty string when no session cookie is present", () => {
    expect(sessionCookie(["theme=dark; path=/"])).toBe("");
  });
});
