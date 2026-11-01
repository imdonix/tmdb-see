import { createRoot } from "react-dom/client";
import styles from "./index.css?inline";
import { Widget } from "./widget";

function mount() {
  const host = document.getElementById("see-widget-root") as HTMLElement | null;
  if (!host) {
    console.warn("[see] #see-widget-root was not found");
    return;
  }
  if (host.dataset.seeMounted === "1") return;
  host.dataset.seeMounted = "1";

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.className = "see-widget";
  shadow.appendChild(mountPoint);

  const config = window.__SEE_WIDGET__ ?? {
    contentType: host.dataset.seeType,
    tmdbID: host.dataset.seeId,
  };

  createRoot(mountPoint).render(
    <Widget contentType={config.contentType ?? ""} tmdbId={config.tmdbID ?? ""} />,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
