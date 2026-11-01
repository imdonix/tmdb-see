import { config } from "../config";
import { logger } from "../lib/logger";
import { requestTmdb, type UpstreamResult } from "./tmdb-upstream";

const MOVIE_RE = /\/movie\/(\d+)(?:-|\/|$)/;
const TV_RE = /\/tv\/(\d+)(?:-|\/|$)/;

const SW_KILL_SCRIPT = `<script id="see-sw-kill">
(function () {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.unregister(); });
      }).catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) { caches.delete(key); });
      }).catch(function () {});
    }
  } catch (error) {}
})();
</script>`;

const PROXY_STYLES = `<style id="see-proxy-styles">
#see-header-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin-left: 12px !important;
  padding: 6px 12px !important;
  border-radius: 8px !important;
  background: #01d277 !important;
  color: #032541 !important;
  font: 600 13px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  letter-spacing: 0.01em !important;
  text-decoration: none !important;
  white-space: nowrap !important;
  vertical-align: middle !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18) !important;
  transition: background 150ms ease, transform 150ms ease !important;
}
#see-header-btn:hover {
  background: #34d399 !important;
  color: #032541 !important;
  transform: translateY(-1px) !important;
}
@media (max-width: 760px) {
  #see-header-btn {
    margin-left: 8px !important;
    padding: 5px 8px !important;
    font-size: 11px !important;
  }
}
#onetrust-banner-sdk, #onetrust-consent-sdk, #onetrust-pc-sdk,
#ot-sdk-btn-floating, .onetrust-pc-dark-filter, .ot-sdk-container,
#ot-sdk-btn, [id*="onetrust"], [class*="onetrust"] {
  display: none !important; visibility: hidden !important; pointer-events: none !important;
  opacity: 0 !important; max-height: 0 !important; overflow: hidden !important;
}
</style>`;

const HEADER_BUTTON = `<a href="/see" id="see-header-btn" title="Open the See dashboard">See Dashboard</a>`;

const COOKIE_SELECTORS = [
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  "#onetrust-pc-sdk",
  "#ot-sdk-btn-floating",
  ".onetrust-pc-dark-filter",
  ".ot-sdk-container",
  "#ot-sdk-btn",
  "[id*='onetrust']",
  "[class*='onetrust']",
  "[id*='cookie-banner']",
  "[class*='cookie-banner']",
  "[id*='cookie_banner']",
  "[class*='cookie_consent']",
  "[id*='cookie-consent']",
];

function extractContent(pathname: string): { type: "movie" | "tv"; id: string } | null {
  const movie = pathname.match(MOVIE_RE);
  if (movie) return { type: "movie", id: movie[1] };
  const tv = pathname.match(TV_RE);
  if (tv) return { type: "tv", id: tv[1] };
  return null;
}

function listingPage(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "");
  if (!path) return false;
  if (["/movie", "/tv", "/person"].includes(path)) return true;
  if (MOVIE_RE.test(pathname) || TV_RE.test(pathname)) return false;
  return path.startsWith("/movie/") || path.startsWith("/tv/") || path.startsWith("/person/");
}

function widgetSnippet(type: "movie" | "tv", id: string): string {
  return `<div id="see-widget-root" data-see-type="${type}" data-see-id="${id}" style="display:block;width:100%;flex:0 0 100%;min-width:0;box-sizing:border-box;margin:0 0 20px;"></div>
<script>window.__SEE_WIDGET__ = { contentType: "${type}", tmdbID: "${id}" };</script>
<script type="module" src="/widget/widget.js?v=${encodeURIComponent(config.version)}"></script>`;
}

function rewriteLocation(location: string | null): string | null {
  if (!location) return null;
  try {
    const url = new URL(location, config.tmdb.origin);
    if (url.origin === config.tmdb.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // ignore malformed location
  }
  return location;
}

function responseHeaders(upstream: UpstreamResult): Headers {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  headers.delete("x-frame-options");
  const location = rewriteLocation(upstream.headers.get("location"));
  if (location) headers.set("location", location);
  const cookies = upstream.headers.getSetCookie();
  if (cookies.length > 0) {
    headers.delete("set-cookie");
    for (const cookie of cookies) {
      headers.append("set-cookie", cookie.replace(/;\s*domain=[^;]+/gi, ""));
    }
  }
  return headers;
}

function bodyBlob(body: Uint8Array): Blob {
  return new Blob([body as unknown as BlobPart]);
}

export async function proxyTmdb(request: Request, pathWithQuery: string): Promise<Response> {
  const target = new URL(`${config.tmdb.origin}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`);
  const method = request.method.toUpperCase();

  let upstream: UpstreamResult;
  try {
    upstream = await requestTmdb(request, target.toString());
  } catch (error) {
    logger.warn("TMDB proxy error", { path: pathWithQuery, error: String(error) });
    return new Response("TMDB upstream is unavailable", { status: 502 });
  }

  const headersOut = responseHeaders(upstream);
  const contentType = upstream.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");
  const rewritable = isHtml && upstream.status >= 200 && upstream.status < 300 && method !== "HEAD";

  if (!rewritable) {
    headersOut.set("cache-control", upstream.headers.get("cache-control") ?? "public, max-age=60");
    return new Response(method === "HEAD" ? null : bodyBlob(upstream.body), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: headersOut,
    });
  }

  const pathname = target.pathname;
  const content = extractContent(pathname);
  const showHeaderButton = !listingPage(pathname);
  let widgetInjected = false;
  let headerButtonInjected = false;
  const cookieMarkers = ["cookielaw", "onetrust", "optanon", "otsdkstub", "ot-sdk"];

  const rewriter = new HTMLRewriter()
    .on("head", {
      element(element) {
        element.prepend(SW_KILL_SCRIPT + PROXY_STYLES, { html: true });
      },
    })
    .on("footer", {
      element(element) {
        element.remove();
      },
    })
    .on("header div.flex", {
      element(element) {
        element.remove();
      },
    })
    .on("#header div.flex", {
      element(element) {
        element.remove();
      },
    })
    .on("section.inner_content.bg_image.community", {
      element(element) {
        element.remove();
      },
    })
    .on("script[src]", {
      element(element) {
        const src = (element.getAttribute("src") ?? "").toLowerCase();
        if (cookieMarkers.some((marker) => src.includes(marker))) element.remove();
      },
    })
    .on("link[href]", {
      element(element) {
        const href = (element.getAttribute("href") ?? "").toLowerCase();
        if (cookieMarkers.some((marker) => href.includes(marker))) element.remove();
      },
    })
    .on("script", {
      text(chunk) {
        const text = chunk.text;
        const lower = text.toLowerCase();
        if (
          (lower.includes("serviceworker") && lower.includes("register")) ||
          cookieMarkers.some((marker) => lower.includes(marker))
        ) {
          chunk.replace("/* disabled by See */");
        }
      },
    });

  if (showHeaderButton) {
    rewriter.on("header .sub_media", {
      element(element) {
        if (headerButtonInjected) return;
        headerButtonInjected = true;
        element.append(HEADER_BUTTON, { html: true });
      },
    });
    rewriter.on("#header .sub_media", {
      element(element) {
        if (headerButtonInjected) return;
        headerButtonInjected = true;
        element.append(HEADER_BUTTON, { html: true });
      },
    });
  }

  for (const selector of COOKIE_SELECTORS) {
    rewriter.on(selector, {
      element(element) {
        element.remove();
      },
    });
  }

  if (content) {
    rewriter.on("div#media_v4 div.white_column", {
      element(element) {
        if (widgetInjected) return;
        widgetInjected = true;
        element.prepend(widgetSnippet(content.type, content.id), { html: true });
      },
    });
  }

  headersOut.set("content-type", contentType);
  headersOut.set("cache-control", "no-store, no-cache, must-revalidate");
  const transformed = rewriter.transform(
    new Response(bodyBlob(upstream.body), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: headersOut,
    }),
  );
  return new Response(transformed.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: headersOut,
  });
}

export function killSwitchServiceWorker(): Response {
  const source = `/* See: neutralize service workers registered on the TMDB proxy origin */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    } catch (error) {}
    try { await self.registration.unregister(); } catch (error) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (client) { client.navigate(client.url); });
    } catch (error) {}
  })());
});
self.addEventListener('fetch', function () { return; });
`;
  return new Response(source, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "service-worker-allowed": "/",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
