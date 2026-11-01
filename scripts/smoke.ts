/**
 * End-to-end smoke test for provider search, torrent grabbing, and
 * qBittorrent tagging. Uses two in-process fake providers and a fake qBit API,
 * so it does not need real credentials.
 *
 * Run with: bun run scripts/smoke.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "see-smoke-"));
process.env.DATA_DIR = dataDir;
process.env.DISABLE_SCHEDULER = "1";
process.env.APP_SECRET = "smoke-test-secret";
process.env.QBIT_SAVE_PATH = "/downloads";
process.env.QBIT_ORGANIZE = "true";
process.env.TMDB_API_KEY = "smoke-tmdb-key";
process.env.LOG_LEVEL = "warn";

const torrentBytes = new TextEncoder().encode("d8:announce13:http://trackere");

interface AddedTorrent {
  hash: string;
  name: string;
  tags: string;
  savePath: string;
  contentLayout: string;
  autoTMM: string;
  rename: string;
}

const added: AddedTorrent[] = [];

const qbit = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/v2/auth/login") {
      return new Response("Ok.", {
        headers: { "set-cookie": "SID=smoke-session; path=/; HttpOnly" },
      });
    }
    if (url.pathname === "/api/v2/app/version") return new Response("v5.0.0");
    if (url.pathname === "/api/v2/torrents/add") {
      const form = await request.formData();
      const file = form.get("torrents");
      const tags = String(form.get("tags") ?? "");
      const hash = `hash${added.length + 1}`;
      added.push({
        hash,
        name: file instanceof File ? file.name : "unknown.torrent",
        tags,
        savePath: String(form.get("savepath") ?? ""),
        contentLayout: String(form.get("contentLayout") ?? ""),
        autoTMM: String(form.get("autoTMM") ?? ""),
        rename: String(form.get("rename") ?? ""),
      });
      return new Response("Ok.");
    }
    if (url.pathname === "/api/v2/torrents/info") {
      return Response.json(
        added.map((torrent, index) => ({
          hash: torrent.hash,
          name: torrent.name,
          progress: 0.25,
          state: "downloading",
          size: 1024 * 1024 * 1024,
          downloaded: 1024 * 1024 * 256,
          uploaded: 0,
          dlspeed: 1024 * 1024,
          upspeed: 0,
          eta: 60,
          ratio: 0,
          tags: torrent.tags,
          category: "",
          save_path: torrent.savePath,
          added_on: Math.floor(Date.now() / 1000) + index,
          completion_on: 0,
          num_seeds: 10,
          num_leechs: 2,
        })),
      );
    }
    if (url.pathname.startsWith("/api/v2/torrents/delete")) {
      const form = await request.formData();
      const hashes = String(form.get("hashes") ?? "");
      for (const hash of hashes.split("|")) {
        const index = added.findIndex((torrent) => torrent.hash === hash);
        if (index >= 0) added.splice(index, 1);
      }
      return new Response("Ok.");
    }
    if (url.pathname.startsWith("/api/v2/torrents/")) return new Response("Ok.");
    return new Response("not found", { status: 404 });
  },
});

const ncore = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const self = url.origin;
    if (url.pathname === "/login") return Response.json({ token: "smoke-token" });
    if (url.pathname === "/search") {
      const body = (await request.json()) as { pattern?: string };
      const pattern = (body.pattern ?? "").toLowerCase();
      const isSeries = pattern.includes("test show");
      const id = isSeries ? "201" : "101";
      const title = isSeries
        ? "Test.Show.S01E01.1080p.WEB-DL.x264-SMOKE"
        : "Fight.Club.1999.1080p.BluRay.x264-SMOKE";
      return Response.json({
        Torrents: [
          {
            ID: id,
            Title: title,
            Key: "key",
            Size: "1.2 GiB",
            Type: isSeries ? "hdser" : "hd",
            Date: new Date().toISOString(),
            Seeders: 42,
            Leechers: 3,
            Download: `${self}/torrent/${id}/download`,
            URL: `${self}/torrents.php?action=details&id=${id}`,
          },
        ],
        NumOfPages: 1,
      });
    }
    if (url.pathname === "/torrent/101" || url.pathname === "/torrent/201") {
      const id = url.pathname.endsWith("201") ? "201" : "101";
      const title =
        id === "201"
          ? "Test.Show.S01E01.1080p.WEB-DL.x264-SMOKE"
          : "Fight.Club.1999.1080p.BluRay.x264-SMOKE";
      return Response.json({
        ID: id,
        Title: title,
        Size: "1.2 GiB",
        Type: id === "201" ? "hdser" : "hd",
        Date: new Date().toISOString(),
        Seeders: 42,
        Leechers: 3,
        Download: `${self}/torrent/${id}/download`,
        URL: `${self}/torrents.php?action=details&id=${id}`,
      });
    }
    if (url.pathname === "/torrent/101/download" || url.pathname === "/torrent/201/download") {
      return new Response(torrentBytes, { headers: { "content-type": "application/x-bittorrent" } });
    }
    return new Response("not found", { status: 404 });
  },
});

const torznab = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const self = url.origin;
    if (url.searchParams.get("t") === "caps") {
      return new Response(
        `<?xml version="1.0"?><caps><categories><category id="2000" name="Movies"><subcat id="2040" name="Movies HD"/></category></categories></caps>`,
        { headers: { "content-type": "application/xml" } },
      );
    }
    if (url.searchParams.get("t") === "search") {
      return new Response(
        `<?xml version="1.0"?><rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel>
        <title>Smoke Indexer</title>
        <item>
          <title>Fight.Club.1999.1080p.BluRay.x264-TORZNAB</title>
          <guid isPermaLink="false">smoke-guid-1</guid>
          <size>1288490188</size>
          <link>${self}/download/1</link>
          <enclosure url="${self}/download/1" length="1288490188" type="application/x-bittorrent"/>
          <category>2040</category>
          <pubDate>${new Date().toUTCString()}</pubDate>
          <torznab:attr name="seeders" value="35"/>
          <torznab:attr name="peers" value="40"/>
        </item>
        </channel></rss>`,
        { headers: { "content-type": "application/xml" } },
      );
    }
    if (url.pathname === "/download/1") {
      return new Response(torrentBytes, { headers: { "content-type": "application/x-bittorrent" } });
    }
    return new Response("not found", { status: 404 });
  },
});

const tmdb = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/movie/550") {
      return Response.json({
        id: 550,
        title: "Fight Club",
        release_date: "1999-10-15",
        poster_path: "/fight-club.jpg",
        overview: "An insomniac office worker forms an underground fight club.",
      });
    }
    if (url.pathname === "/tv/1399") {
      return Response.json({
        id: 1399,
        name: "Test Show",
        first_air_date: "2020-01-01",
        poster_path: "/test-show.jpg",
        seasons: [
          { season_number: 0, episode_count: 2, name: "Specials" },
          { season_number: 1, episode_count: 2, name: "Season 1", air_date: "2020-01-01" },
        ],
      });
    }
    if (url.pathname === "/configuration") {
      return Response.json({ images: { secure_base_url: "https://image.tmdb.org/t/p/" } });
    }
    return new Response("not found", { status: 404 });
  },
});

let aiCalls = 0;
const ollama = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/tags") {
      return Response.json({ models: [{ name: "smoke-model:latest" }] });
    }
    if (url.pathname === "/api/chat") {
      aiCalls += 1;
      const body = (await request.json()) as { messages?: Array<{ content?: string }> };
      const prompt = body.messages?.at(-1)?.content ?? "";
      const indexes = [...prompt.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));
      return Response.json({
        message: {
          role: "assistant",
          content: JSON.stringify({
            results: (indexes.length ? indexes : [1]).map((index) => ({
              index,
              match: true,
              confidence: 0.93,
              reason: "Exact title and year match.",
            })),
          }),
        },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

process.env.QBIT_HOST = `http://127.0.0.1:${qbit.port}`;
process.env.QBIT_USER = "admin";
process.env.QBIT_PASS = "adminadmin";
process.env.TMDB_API_BASE = `http://127.0.0.1:${tmdb.port}`;

const { app } = await import("../apps/server/src/app");
const { seedSettings } = await import("../apps/server/src/services/settings");
const { closeDatabase } = await import("../apps/server/src/db");
seedSettings();

async function call(pathname: string, init?: RequestInit) {
  const response = await app.fetch(
    new Request(`http://localhost${pathname}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    }),
  );
  const text = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}: ${text.slice(0, 500)}`);
  return body;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  const ncoreProvider = await call("/api/providers", {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke nCore",
      kind: "ncore",
      config: {
        baseUrl: `http://127.0.0.1:${ncore.port}`,
        username: "user",
        password: "pass",
      },
    }),
  });
  console.log("created ncore provider:", ncoreProvider.provider.id);

  const health = await call(`/api/providers/${ncoreProvider.provider.id}/test`, { method: "POST" });
  assert(health.health.ok, `ncore test failed: ${health.health.message}`);
  console.log("ncore provider login: ok");

  const search = await call("/api/search", {
    method: "POST",
    body: JSON.stringify({ query: "fight club", providerIds: [ncoreProvider.provider.id] }),
  });
  assert(search.items.length === 1, "expected one ncore result");
  console.log("ncore search:", search.items[0].title);

  const detail = await call(`/api/torrents/${ncoreProvider.provider.id}/101`);
  assert(detail.torrent.title.includes("Fight.Club"), "ncore detail lookup failed");
  console.log("ncore detail: ok");

  const grab = await call(`/api/torrents/${ncoreProvider.provider.id}/101/grab`, {
    method: "POST",
    body: "{}",
  });
  assert(grab.item.id === "101", "grab response mismatch");
  assert(added.length === 1, "qBittorrent did not receive the torrent");
  assert(added[0].tags.includes("see:"), "provider tag missing");
  console.log("ncore grab: qBittorrent received tagged torrent");

  const qbitList = await call("/api/qbit/torrents");
  assert(qbitList.torrents.length === 1, "qBittorrent list is empty");
  assert(qbitList.torrents[0].ref.providerId === ncoreProvider.provider.id, "qBittorrent ref mismatch");
  console.log("qBittorrent tracking: ok");

  const torznabProvider = await call("/api/providers", {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke Torznab",
      kind: "torznab",
      config: { baseUrl: `http://127.0.0.1:${torznab.port}/api`, apiKey: "key" },
    }),
  });
  console.log("created torznab provider:", torznabProvider.provider.id);

  const torznabSearch = await call("/api/search", {
    method: "POST",
    body: JSON.stringify({ query: "fight club", providerIds: [torznabProvider.provider.id] }),
  });
  assert(torznabSearch.items.length === 1, "expected one torznab result");
  assert(torznabSearch.items[0].seeders === 35, "torznab seeders were not parsed");
  assert(torznabSearch.items[0].leechers === 5, "torznab peers were not converted to leechers");
  console.log("torznab search:", torznabSearch.items[0].title);

  const torznabId = torznabSearch.items[0].id;
  const torznabDetail = await call(`/api/torrents/${torznabProvider.provider.id}/${torznabId}`);
  assert(torznabDetail.torrent.title.includes("TORZNAB"), "torznab cached detail lookup failed");
  console.log("torznab cached detail: ok");

  const torznabGrab = await call(`/api/torrents/${torznabProvider.provider.id}/${torznabId}/grab`, {
    method: "POST",
    body: "{}",
  });
  assert(torznabGrab.item.providerKind === "torznab", "torznab grab response mismatch");
  assert(added.length === 2, "qBittorrent did not receive the torznab torrent");
  console.log("torznab grab: ok");

  const movieOverview = await call("/api/movies/550");
  assert(movieOverview.movie.name === "Fight Club", "TMDB movie lookup failed");
  assert(movieOverview.resolutions.some((entry: any) => entry.quality === "1080p"), "movie resolutions missing");
  console.log(
    "movie overview:",
    movieOverview.resolutions.map((entry: any) => `${entry.quality}:${entry.releases}`).join(", "),
  );

  const movieDownload = await call("/api/movies/550/download", {
    method: "POST",
    body: JSON.stringify({ quality: "1080p" }),
  });
  assert(movieDownload.download.providerId === ncoreProvider.provider.id, "movie did not pick the best provider");
  assert(movieDownload.download.status === "downloading", "movie download status mismatch");
  assert(added.length === 3, "qBittorrent did not receive the movie");
  assert(
    added[2].savePath === "/downloads/Movies/Fight Club (1999)",
    `movie save path mismatch: ${added[2].savePath}`,
  );
  assert(added[2].contentLayout === "NoSubfolder", "movie contentLayout mismatch");
  assert(added[2].autoTMM === "false", "movie autoTMM should be disabled");
  assert(added[2].rename === "", "movie should not be renamed");
  assert(added[2].tags.includes("movie:550"), "movie tag missing");
  console.log("movie download: Jellyfin movie path and tags ok");

  const follow = await call("/api/follows", {
    method: "POST",
    body: JSON.stringify({ tmdbId: 1399, quality: "1080p" }),
  });
  assert(follow.follow.name === "Test Show", "follow creation failed");
  const check = await call("/api/follows/1399/check", { method: "POST" });
  assert(check.result.scheduled === 1, `follow check scheduled ${check.result.scheduled}`);
  assert(added.length === 4, "qBittorrent did not receive the followed episode");
  assert(
    added[3].savePath === "/downloads/TV Shows/Test Show (2020)/Season 01",
    `series save path mismatch: ${added[3].savePath}`,
  );
  assert(added[3].contentLayout === "Subfolder", "series episode should use a subfolder");
  assert(added[3].autoTMM === "false", "series autoTMM should be disabled");
  assert(added[3].rename === "Test Show (2020) S01E01", `series episode folder mismatch: ${added[3].rename}`);
  assert(added[3].tags.includes("show:1399"), "series tag missing");
  assert(added[3].tags.includes("season:1"), "season tag missing");
  assert(added[3].tags.includes("episode:1"), "episode tag missing");
  const followDetail = await call("/api/follows/1399");
  assert(
    followDetail.items.some((item: any) => item.episode === 1 && item.status === "downloading"),
    "follow item was not tracked",
  );
  console.log("follow check: episode grabbed with Jellyfin layout");

  await call("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({
      ai: {
        enabled: true,
        baseUrl: `http://127.0.0.1:${ollama.port}`,
        model: "smoke-model",
        verifyDownloads: false,
        verifyFollows: false,
        threshold: 0.75,
      },
    }),
  });
  const aiTarget = { type: "movie", tmdbId: 550, title: "Fight Club", year: "1999" };
  const aiFirst = await call("/api/ai/verify", {
    method: "POST",
    body: JSON.stringify({
      target: aiTarget,
      items: [{ id: "101", providerId: ncoreProvider.provider.id, title: "Fight.Club.1999.1080p.BluRay" }],
    }),
  });
  assert(aiFirst.results[0].verified === true, "AI verification did not confirm the release");
  assert(aiFirst.results[0].confidence === 0.93, "AI confidence was not parsed");
  assert(aiCalls === 1, "AI was not called exactly once");
  const aiCached = await call("/api/ai/verify", {
    method: "POST",
    body: JSON.stringify({
      target: aiTarget,
      items: [{ id: "101", providerId: ncoreProvider.provider.id, title: "Fight.Club.1999.1080p.BluRay" }],
    }),
  });
  assert(aiCached.cachedCount === 1, "AI result was not cached");
  assert(aiCalls === 1, "AI cache was not used");
  const aiHealth = await call("/api/ai/test", { method: "POST", body: "{}" });
  assert(aiHealth.health.ok, `AI health check failed: ${aiHealth.health.message}`);
  console.log("AI verification and cache: ok");

  const unconfigured = await call("/api/ai/test", {
    method: "POST",
    body: JSON.stringify({ baseUrl: "http://127.0.0.1:1", model: "test" }),
  });
  assert(unconfigured.health.ok === false, "AI test should fail against a closed port");
  console.log("AI error handling: ok");

  console.log("\nSmoke test passed.");
} finally {
  closeDatabase();
  ncore.stop(true);
  qbit.stop(true);
  torznab.stop(true);
  tmdb.stop(true);
  ollama.stop(true);
  rmSync(dataDir, { recursive: true, force: true });
}
