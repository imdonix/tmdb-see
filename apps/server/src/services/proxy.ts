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
  border: 0 !important;
  cursor: pointer !important;
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
#see-auth-modal {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483600 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 16px !important;
  background: rgba(2, 6, 23, 0.72) !important;
  backdrop-filter: blur(6px) !important;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
}
#see-auth-dialog {
  width: 100% !important;
  max-width: 360px !important;
  border-radius: 14px !important;
  border: 1px solid rgba(52, 211, 153, 0.28) !important;
  background: linear-gradient(180deg, #0f172a, #030712) !important;
  color: #e2e8f0 !important;
  padding: 20px !important;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55) !important;
  box-sizing: border-box !important;
}
#see-auth-head {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  margin-bottom: 16px !important;
}
#see-auth-logo {
  display: inline-flex !important;
  width: 34px !important;
  height: 34px !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 10px !important;
  background: #34d399 !important;
  color: #052e16 !important;
  font-weight: 800 !important;
  font-size: 16px !important;
}
#see-auth-title {
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #f8fafc !important;
}
#see-auth-sub {
  margin-top: 2px !important;
  font-size: 11px !important;
  line-height: 1.4 !important;
  color: #94a3b8 !important;
}
#see-auth-label {
  display: block !important;
  margin-bottom: 6px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
  color: #94a3b8 !important;
}
#see-auth-key {
  width: 100% !important;
  box-sizing: border-box !important;
  border-radius: 9px !important;
  border: 1px solid rgba(148, 163, 184, 0.35) !important;
  background: rgba(2, 6, 23, 0.7) !important;
  color: #f8fafc !important;
  padding: 9px 11px !important;
  font: 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace !important;
  outline: none !important;
}
#see-auth-key:focus {
  border-color: #34d399 !important;
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.18) !important;
}
#see-auth-error {
  min-height: 16px !important;
  margin-top: 7px !important;
  font-size: 11px !important;
  color: #fca5a5 !important;
}
#see-auth-actions {
  display: flex !important;
  justify-content: flex-end !important;
  gap: 8px !important;
  margin-top: 6px !important;
}
#see-auth-cancel, #see-auth-submit {
  cursor: pointer !important;
  border-radius: 8px !important;
  padding: 8px 14px !important;
  font: 600 12px/1 ui-sans-serif, system-ui, sans-serif !important;
}
#see-auth-cancel {
  border: 1px solid rgba(148, 163, 184, 0.3) !important;
  background: transparent !important;
  color: #cbd5e1 !important;
}
#see-auth-submit {
  border: 0 !important;
  background: #34d399 !important;
  color: #052e16 !important;
}
#see-auth-submit:disabled {
  opacity: 0.6 !important;
  cursor: default !important;
}
#onetrust-banner-sdk, #onetrust-consent-sdk, #onetrust-pc-sdk,
#ot-sdk-btn-floating, .onetrust-pc-dark-filter, .ot-sdk-container,
#ot-sdk-btn, [id*="onetrust"], [class*="onetrust"] {
  display: none !important; visibility: hidden !important; pointer-events: none !important;
  opacity: 0 !important; max-height: 0 !important; overflow: hidden !important;
}
</style>`;

const HEADER_BUTTON = `<button type="button" id="see-header-btn" title="Sign in to See">See - Login</button>`;

const AUTH_SCRIPT = `<script id="see-auth">
(function () {
  var STORAGE_KEY = 'see.apiKey';
  var EVENT = 'see:auth';
  function getKey() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (error) { return ''; }
  }
  function setKey(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (error) {}
  }
  function clearKey() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
  }
  function emit(authenticated) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { authenticated: authenticated } }));
    } catch (error) {}
  }
  function button() { return document.getElementById('see-header-btn'); }
  function render() {
    var el = button();
    if (!el) return;
    var authenticated = Boolean(getKey());
    el.textContent = authenticated ? 'See - Dashboard' : 'See - Login';
    el.title = authenticated ? 'Open the See dashboard' : 'Sign in to See';
    el.setAttribute('data-authenticated', authenticated ? '1' : '0');
  }
  function closeModal() {
    var modal = document.getElementById('see-auth-modal');
    if (modal) modal.remove();
  }
  function openModal() {
    if (document.getElementById('see-auth-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'see-auth-modal';
    wrap.innerHTML =
      '<div id="see-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="see-auth-title">' +
        '<div id="see-auth-head">' +
          '<span id="see-auth-logo">S</span>' +
          '<div>' +
            '<div id="see-auth-title">See - Login</div>' +
            '<div id="see-auth-sub">Enter the API key printed in the See server logs.</div>' +
          '</div>' +
        '</div>' +
        '<form id="see-auth-form">' +
          '<label id="see-auth-label" for="see-auth-key">API key</label>' +
          '<input id="see-auth-key" type="password" autocomplete="current-password" spellcheck="false" placeholder="Paste your API key" />' +
          '<div id="see-auth-error" role="alert"></div>' +
          '<div id="see-auth-actions">' +
            '<button type="button" id="see-auth-cancel">Cancel</button>' +
            '<button type="submit" id="see-auth-submit">Sign in</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(wrap);

    var form = wrap.querySelector('#see-auth-form');
    var input = wrap.querySelector('#see-auth-key');
    var error = wrap.querySelector('#see-auth-error');
    var submit = wrap.querySelector('#see-auth-submit');
    var keydown = function (event) {
      if (event.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', keydown);
      }
    };

    function fail(message) { error.textContent = message; }
    function working(value) {
      submit.disabled = value;
      submit.textContent = value ? 'Checking…' : 'Sign in';
    }

    input.focus();
    wrap.addEventListener('click', function (event) { if (event.target === wrap) closeModal(); });
    wrap.querySelector('#see-auth-cancel').addEventListener('click', closeModal);
    document.addEventListener('keydown', keydown);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var key = input.value.trim();
      if (!key) { fail('Enter the API key from the See logs.'); return; }
      fail('');
      working(true);
      fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      })
        .then(function (response) { return response.ok; })
        .then(function (ok) {
          if (!ok) {
            fail('That API key was rejected.');
            working(false);
            return;
          }
          setKey(key);
          render();
          closeModal();
          emit(true);
        })
        .catch(function () {
          fail('Could not reach See. Is the server running?');
          working(false);
        });
    });
  }
  function bind() {
    var el = button();
    if (!el) return;
    el.addEventListener('click', function (event) {
      event.preventDefault();
      if (getKey()) window.location.href = '/see';
      else openModal();
    });
  }
  function validate() {
    var key = getKey();
    if (!key) { render(); return; }
    fetch('/api/auth/session', { headers: { 'x-api-key': key } })
      .then(function (response) {
        if (response.status === 401) {
          clearKey();
          render();
          emit(false);
          return;
        }
        render();
      })
      .catch(function () { render(); });
  }
  document.addEventListener('DOMContentLoaded', function () { render(); bind(); validate(); });
  window.addEventListener(EVENT, render);
  window.addEventListener('see:auth-invalid', function () { clearKey(); render(); });
  window.addEventListener('storage', function (event) { if (event.key === STORAGE_KEY) render(); });
})();
</script>`;

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
        element.prepend(SW_KILL_SCRIPT + PROXY_STYLES + AUTH_SCRIPT, { html: true });
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
