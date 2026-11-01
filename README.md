# See

**See** is a self-hosted bridge between [TMDB](https://www.themoviedb.org), multiple torrent providers, AI release verification, and qBittorrent. It is the successor to [`ncore-tmdb`](https://github.com/imdonix/ncore-tmdb) and keeps the same core workflow:

- browse TMDB through a local proxy;
- use an injected **See widget** on movie and series pages;
- schedule a movie download or follow a series in one click;
- search across every enabled torrent provider from one dashboard;
- track everything in qBittorrent.

The important change is that **nCore is no longer hard-wired**. Providers live behind an adapter layer. `nCore` is the default adapter, and a `Torznab` adapter covers Prowlarr, Jackett, and other compatible indexers. New engines can be added without changing the dashboard, widget, follow engine, or qBittorrent layer.

---

## Feature tour

| Area | What See does |
| --- | --- |
| TMDB proxy | Proxies `www.themoviedb.org`, removes cookie/footer clutter, and injects the See widget on movie/TV detail pages. |
| Movie widget | Detects available resolutions across providers, shows best seeders, and sends the best release to qBittorrent. Live progress on the TMDB page. |
| Series follow | Quality selection, skipped seasons, hourly checks, episode parsing, season-pack upgrades, and Jellyfin-friendly folders. |
| Multi-provider search | Aggregated search across enabled providers with provider health, categories, sort, filters, and per-provider errors. |
| AI verification | Ollama Cloud or self-hosted Ollama decides whether a release title really belongs to the requested film/show/episode. Manual checks, automatic movie checks, automatic follow checks, threshold and 14-day cache. |
| qBittorrent | Add torrents with provider tags, track progress, pause/resume/recheck, delete with or without files, and link queue items back to their release. |
| Dashboard | Overview, live queue, follows, downloads, recent activity, and settings. |
| Providers | Add/edit/delete nCore and Torznab providers, test connections, set priority, and enable/disable them. |
| Deployment | Single Bun process, SQLite in a volume, minimal Helm chart with the old Secret shape. |

---

## Architecture

```text
 Browser ──► https://tmdb.local/
              │
              ▼
        ┌──────────────────────────────────────────────┐
        │ See (Bun + Hono)                             │
        │                                              │
        │  TMDB proxy + widget injection               │
        │  /see  React dashboard (shadcn/ui)           │
        │  /widget/widget.js  Shadow DOM widget         │
        │  /api/*  typed JSON API                       │
        │                                              │
        │  provider manager ── nCore adapter            │
        │                   └─ Torznab adapter          │
        │  AI verifier ───── Ollama                     │
        │  follow scheduler + qBittorrent tracker       │
        │  SQLite (settings, follows, cache, events)    │
        └───────────────┬──────────────────────────────┘
                        │
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
   nCore API       Torznab/Prowlarr     qBittorrent
   (ncore-go)      (other indexers)     Web API
```

The **widget is a library build mounted inside a Shadow DOM**, so TMDB does not fight its CSS. TMDB itself is proxied through the same process, which means `/widget`, `/api`, `/see`, and TMDB pages all share one origin.

### Why curl for the TMDB upstream?

Cloudflare in front of `www.themoviedb.org` rejects Bun/Node's TLS fingerprint with a challenge ("Just a moment…"). See transparently uses `curl` only for the TMDB proxy, then injects HTML with Bun's `HTMLRewriter`. The runtime image includes curl. Everything else, including the TMDB metadata API and all provider traffic, uses normal `fetch`.

---

## Quick start (Docker Compose)

Requirements:

- Docker + Compose
- TMDB API key ([themoviedb.org → Settings → API](https://www.themoviedb.org/settings/api))
- nCore account + an [ncore-go](https://github.com/imdonix/ncore) compatible API, or a Torznab endpoint

```bash
cp .env.example .env
# Edit .env:
#   TMDB_API_KEY=...
#   NCORE_USER=...
#   NCORE_PASS=...
#   QBIT_USER=...
#   QBIT_PASS=...

docker compose up -d --build
```

Open:

- TMDB proxy with widget: `http://localhost:8080`
- See dashboard: `http://localhost:8080/see`
- qBittorrent Web UI (bundled): `http://localhost:1002`

The Compose stack starts an `ncore` API, qBittorrent and See. See's SQLite database lives in the named `see-data` volume; qBittorrent config/downloads live in `./tmp`. To inspect or back up the database, use `docker compose cp see:/app/data ./see-data-backup` or `docker run --rm -v tmdb-see_see-data:/data alpine tar -C /data -czf - . > see-data.tar.gz`.

The bundled qBittorrent uses `qbittorrentofficial/qbittorrent-nox`. That image has no credential environment variables, so `k8s/tmdb-see/files/qbit-seed-config.py` writes a PBKDF2 hash made from `QBIT_USER`/`QBIT_PASS` into the qBittorrent config before the server starts. See and the Web UI therefore share the same credentials from the first boot — no temporary password to copy from the logs.

> The first boot seeds provider and integration settings from environment variables. After that, use **Settings** in the dashboard. Secrets are encrypted at rest.

---

## Local development

Requirements: Bun 1.4+, curl.

```bash
bun install
bun run dev
```

- API + TMDB proxy + injected widget: `http://localhost:8080`
- Dashboard with Vite HMR: `http://localhost:5173/see/`
- Widget bundle rebuilds in watch mode into `apps/server/public/widget/`

To exercise the whole API without real credentials:

```bash
bun run smoke
```

The smoke test starts fake nCore, Torznab, TMDB, Ollama, and qBittorrent servers, then verifies search, grabbing, qBittorrent tags, movie resolution selection, follow checks, Jellyfin paths, and AI caching.

Production build:

```bash
bun run build     # web + widget
bun run start     # API/proxy on :8080
```

---

## Configuration

### Environment variables

Environment values only **seed the database on first boot**. Later changes belong in the dashboard.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port. |
| `HOST` | `0.0.0.0` | Listen address. |
| `DATA_DIR` | `./data` | SQLite, WAL files, and generated encryption key. |
| `APP_SECRET` | generated key file | AES-256-GCM key material for provider/API secrets. Set this for stable encryption if you do not keep the data volume. |
| `TMDB_API_KEY` | — | TMDB v3 API key. Also settable in Settings. |
| `TMDB_LANGUAGE` | `en-US` | Metadata language. |
| `NCORE_HOST` | — | ncore-go API base URL. Seeds the default nCore provider. |
| `NCORE_USER`, `NCORE_PASS` | — | nCore API credentials. |
| `TORZNAB_NAME` | `Prowlarr` | Optional Torznab provider name. |
| `TORZNAB_URL` | — | Optional Torznab endpoint. |
| `TORZNAB_API_KEY` | — | Optional Torznab key. |
| `QBIT_HOST` | — | qBittorrent Web UI URL. |
| `QBIT_USER`, `QBIT_PASS` | — | qBittorrent credentials. |
| `QBIT_SAVE_PATH` | — | Base downloads path inside qBittorrent, e.g. `/downloads`. See creates `Movies/` and `TV Shows/` beneath it. |
| `QBIT_ORGANIZE` | `true` | Create movie/show/season/episode folders. |
| `AI_ENABLED` | `false` | Enable the Ollama verifier. |
| `OLLAMA_BASE_URL` | `https://ollama.com` | Ollama Cloud or self-hosted Ollama. |
| `OLLAMA_API_KEY` | — | Ollama Cloud API key. |
| `OLLAMA_MODEL` | `gpt-oss:120b` | Model used for verification. |
| `AI_VERIFY_DOWNLOADS` | `false` | Automatically verify movie releases before qBittorrent. |
| `AI_VERIFY_FOLLOWS` | `false` | Automatically verify follow candidates. |
| `AI_THRESHOLD` | `0.75` | Confidence cutoff for automatic verification. |
| `FOLLOW_INTERVAL_MINUTES` | `60` | Follow scan interval (minimum 5). |
| `DISABLE_SCHEDULER` | `false` | Disable background follow and download-tracking loops. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |
| `CURL_BIN` | `curl` | Override the TMDB proxy transport binary. |

### Providers

Open **Settings → Providers**.

**nCore**

- Kind: `nCore API`
- Base URL: your `ncore-go` endpoint, e.g. `http://ncore:8080`
- Username / password: nCore credentials

See authenticates against ncore-go, reuses its token, and transparently re-authenticates on expiry.

**Torznab**

- Kind: `Torznab`
- Base URL: e.g. `http://prowlarr:9696/1/api` or a Jackett `/results/torznab/api` URL
- API key

Downloads are restricted to the configured indexer host by default. Enable **Allow external download hosts** only when your indexer deliberately redirects downloads to another host.

### AI / Ollama Cloud

1. Create an API key at [ollama.com](https://ollama.com).
2. Open **Settings → AI**.
3. Set base URL to `https://ollama.com`, choose a model, paste the key.
4. Click **Test connection** and save.
5. Enable **Verify movie downloads** and/or **Verify series checks**.

Automatic behavior is intentionally strict:

- Verification is applied to the best candidates for the requested quality/episode.
- A release must return `match: true` and reach the configured confidence threshold.
- If the AI call succeeds but rejects every candidate, See refuses to guess. The error explains why. Lower the threshold, disable the verifier, or choose another quality.
- If the AI call itself fails (network, bad key, timeout), See logs a warning and falls back to the title/year/episode heuristics so downloads do not stop.
- Results are cached for 14 days per model + target + title, so repeated checks are free.
- Manual verification is available from any release detail page and from search results when a target is attached (for example, when arriving from the TMDB widget).

The prompt explicitly asks the model to reject remakes, sequels, wrong years, wrong seasons/episodes, compilations, and similarly named films. Confidence and the reason are shown in the UI.

### qBittorrent layout

With `QBIT_SAVE_PATH=/downloads` and folder layout enabled, See writes a Jellyfin-compatible structure:

```text
/downloads/
  Movies/
    Fight Club (1999)/
      Fight.Club.1999.1080p.BluRay.x264.mkv
      ...
  TV Shows/
    House of the Dragon (2022)/
      Season 01/
        House of the Dragon (2022) S01E01/
          House.of.the.Dragon.S01E01.1080p.mkv
        House.of.the.Dragon.S01E02.1080p.mkv
      Season 02/
        House of the Dragon (2022) S02E01/
          House.of.the.Dragon.S02E01.1080p.mkv
```

Point your Jellyfin libraries at:

- **Movies:** `/downloads/Movies`
- **Shows:** `/downloads/TV Shows`

`QBIT_SAVE_PATH` is the base download root, not the Jellyfin library root. The layout switch is enabled by default.

- Movies are flattened directly into `Movies/Movie Name (Year)/`.
- Season packs are flattened directly into `TV Shows/Show Name (Year)/Season NN/`.
- Single episodes get their own `Show Name (Year) SxxEyy/` folder inside the season folder. Jellyfin supports episode folders and groups multiple versions correctly. This also prevents separate episode torrents from overwriting shared files such as `sample.mkv` or subtitle files.

See sends `contentLayout=NoSubfolder` for movies and season packs, and `contentLayout=Subfolder` with a clean episode-folder name for single episodes. This requires qBittorrent **4.3.2 or newer** (Web API v2.7+).

Season-pack upgrades remove individual episode torrents/files before queuing the pack, so the flat pack layout cannot collide with an existing episode folder. If the pack cannot be queued, the removed episodes remain retriable on the next check.

---

## Dashboard

| Page | Purpose |
| --- | --- |
| **Overview** | Live queue, speeds, follows needing attention, provider health, AI state, recent events. |
| **Search** | Multi-provider search, provider toggles, category/where/sort, paged results, quick grab, AI target. |
| **Torrent detail** | Metadata, `.torrent` download, source link, qBittorrent state, AI checker. |
| **Follows** | Follow list, episode status, live qBit progress, check now/all, edit quality/status/skips, unfollow. |
| **Downloads** | Full qBittorrent queue, filter/search, pause/resume/recheck, delete with file choice, provider/TMDB links. |
| **Settings** | Providers, Ollama, TMDB, qBittorrent, follow interval, default quality, page size, all on one page. |

The old `/ncore` URL permanently redirects to `/see`.

### Widget

On a TMDB movie page:

- resolutions are aggregated across enabled providers;
- when multiple providers have the same resolution, choose **Best** or a specific source;
- existing qBittorrent progress is shown inline;
- AI verification, if present, is shown with confidence and reason.

On a TV page:

- choose 2160p/1080p/720p;
- mark already-owned seasons as skipped;
- follow once and let the hourly scanner work;
- check now, save skips, open the release, or manage the follow.

---

## Helm

Chart: `k8s/tmdb-see`.

It is deliberately close to the old `ncore-tmdb` chart:

- one Service/Ingress on host `tmdb.local`, path `/`;
- same default Secret name `ncore-tmdb-secrets`;
- same secret keys `TMDB_API_KEY`, `NCORE_USER`, `NCORE_PASS`, `QBIT_USER`, `QBIT_PASS`;
- optional `OLLAMA_API_KEY` and `APP_SECRET`;
- bundled nCore deployment at `ncore:8080`;
- bundled `qbittorrentofficial/qbittorrent-nox` at `qbittorrent:8080`, with credentials seeded from the same Secret.

Create the Secret once (reusing the old one works):

```bash
kubectl create secret generic ncore-tmdb-secrets \
  --from-literal=TMDB_API_KEY=... \
  --from-literal=NCORE_USER=... \
  --from-literal=NCORE_PASS=... \
  --from-literal=QBIT_USER=... \
  --from-literal=QBIT_PASS=... \
  --from-literal=OLLAMA_API_KEY=... \
  --from-literal=APP_SECRET="$(openssl rand -hex 32)"
```

Install:

```bash
helm upgrade --install tmdb-see k8s/tmdb-see \
  --namespace default \
  --set ingress.host=tmdb.local
```

Useful overrides:

```yaml
image:
  repository: imdonix/tmdb-see
  tag: latest

env:
  ncoreHost: http://ncore:8080
  qbitHost: http://qbittorrent:8080
  qbitSavePath: /downloads
  qbitOrganize: "true"

existingSecret: ncore-tmdb-secrets

persistence:
  enabled: true
  size: 1Gi
  # storageClass: local-path

ingress:
  host: tmdb.local
  className: traefik

ncore:
  enabled: false   # when you already run ncore-go elsewhere
  image: imdonix/ncore:latest

qbit:
  enabled: false   # when you already run qBittorrent elsewhere
  image: qbittorrentofficial/qbittorrent-nox:latest
  configPath: /mnt/hdd/qbit-config
  downloadsPath: /mnt/hdd/downloads
```

The chart includes:

- one replica, `Recreate` strategy;
- PVC on `/app/data`;
- startup/readiness/liveness probes against `/api/health`;
- non-root UID 1000, read-only root filesystem, `/tmp` emptyDir, dropped capabilities;
- one Ingress for the whole host;
- optional bundled nCore and qBittorrent deployments;
- only the essential image/env/persistence/ingress/ncore/qbit values.

The bundled qBittorrent runs as `qbittorrentofficial/qbittorrent-nox` and stores
state/downloads on the host paths in `qbit.configPath` and
`qbit.downloadsPath`. An init container writes a PBKDF2 hash derived from the
Secret's `QBIT_USER`/`QBIT_PASS` into the WebUI config, so See can log in
immediately and no temporary password appears in the logs.

**The chart is fixed at 1 replica.** SQLite is single-writer and the follow scanner runs in-process.

### Switching from `ncore-tmdb`

1. Reuse the existing `ncore-tmdb-secrets`.
2. Install this chart. The dashboard is `/see`; `/ncore` redirects.
3. If your old release also deployed `ncore` and you want the chart's bundled copy, leave `ncore.enabled=true`; otherwise disable it and keep the existing service.
4. The chart can also run qBittorrent (`qbit.enabled=true`, the default). Remove any old qBittorrent Deployment/Service named `qbittorrent` from the same namespace first, or set `qbit.enabled=false` and keep pointing `env.qbitHost` at the old instance. The bundled copy reuses `/mnt/hdd/qbit-config` and `/mnt/hdd/downloads`, so the existing queue and files carry over.
5. The SQLite schema is new. Existing follows are not imported automatically. The queue in qBittorrent is unaffected, and new releases can be picked up by re-following the shows.

---

## API

All routes are JSON unless noted.

```text
GET    /api/health
GET    /api/overview
GET    /api/events?limit=50

GET    /api/providers
GET    /api/providers/admin
POST   /api/providers
PATCH  /api/providers/:id
DELETE /api/providers/:id
POST   /api/providers/:id/test
GET    /api/providers/:id/activity
GET    /api/providers/:id/recommended

POST   /api/search
GET    /api/torrents/:providerId/:torrentId
GET    /api/torrents/:providerId/:torrentId/file
POST   /api/torrents/:providerId/:torrentId/grab

GET    /api/movies/:tmdbId
POST   /api/movies/:tmdbId/download
GET    /api/movies/:tmdbId/download

GET    /api/follows
POST   /api/follows
POST   /api/follows/check-all
GET    /api/follows/:tmdbId
PATCH  /api/follows/:tmdbId
DELETE /api/follows/:tmdbId
POST   /api/follows/:tmdbId/check

GET    /api/qbit/torrents
GET    /api/qbit/torrents/by-ref/:providerId/:torrentId
POST   /api/qbit/torrents/:hash/pause|resume|recheck
DELETE /api/qbit/torrents/:hash?deleteFiles=true

POST   /api/ai/verify
POST   /api/ai/test
GET    /api/settings
PATCH  /api/settings
POST   /api/settings/test/qbit
POST   /api/settings/test/tmdb
```

Shared request/response types live in `packages/shared/src/types.ts`.

---

## Data and security

- Data directory: `DATA_DIR` (default `./data`), file `see.db` in WAL mode, database file mode `0600`.
- Secrets in SQLite (provider configs, qBittorrent password, TMDB/Ollama keys) use AES-256-GCM.
- If `APP_SECRET` is unset, a random 32-byte key is created at `DATA_DIR/secret.key` with mode `0600`. **Losing this file makes stored secrets unreadable.**
- The dashboard/API has no built-in login, matching the predecessor. Put the ingress behind your normal auth middleware or keep it on a trusted network. The API can add/delete qBittorrent torrents and change provider credentials.
- Torznab downloads are host-restricted by default to prevent SSRF; enable external download hosts only deliberately.
- The TMDB proxy strips CSP and frames so the widget can run, and neutralizes TMDB service workers with a self-unregistering `/sw.js`.
- qBittorrent and nCore credentials never reach the browser.

---

## Tests

```bash
bun test          # unit tests (parsing, naming, tags, follow persistence)
bun run smoke     # full fake-provider end-to-end smoke
bun run typecheck
helm lint k8s/tmdb-see
```

---

## Project layout

```text
apps/server/          Bun + Hono API, proxy, providers, AI, scheduler, SQLite
apps/web/             React dashboard (shadcn/ui, Tailwind v4, React Query)
apps/widget/          React widget library, Shadow DOM, injected by the proxy
packages/shared/      Shared types and formatters
packages/ui/          shadcn-style primitives shared by dashboard and widget
k8s/tmdb-see/        Kubernetes Helm chart
k8s/tmdb-see/files/  qBittorrent credential seeding used by Helm and Compose
scripts/smoke.ts      End-to-end fake-provider test
```

---

## Notes / limitations

- One See instance per SQLite database. Do not scale horizontally.
- TMDB pages are proxied; TMDB account-specific actions are not a goal.
- Torznab `get`/details are reconstructed from the search cache; re-search if an old detail link expires.
- AI verification quality depends on the configured model. The default prompts are optimised for strict matching, not for discovering releases.
- Provider priority is used as a tie-breaker: lower numbers win ties in search and automatic release selection.
