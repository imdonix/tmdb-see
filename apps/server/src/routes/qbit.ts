import { Hono } from "hono";
import { providerManager } from "../providers/manager";
import {
  controlQbitTorrent,
  deleteQbitTorrent,
  getQbitByRef,
  listQbitTorrents,
} from "../services/qbit";
import { recordEvent } from "../services/events";
import { ApiError } from "../lib/errors";

export const qbitRoute = new Hono();

function enrichProviderNames<T extends { ref?: { providerId?: string; providerName?: string; providerKind?: "ncore" | "torznab" } }>(
  torrents: T[],
): T[] {
  return torrents.map((torrent) => {
    if (!torrent.ref?.providerId) return torrent;
    const adapter = providerManager.getAdapter(torrent.ref.providerId);
    return {
      ...torrent,
      ref: {
        ...torrent.ref,
        providerName: adapter?.name ?? torrent.ref.providerId,
        providerKind: adapter?.kind,
      },
    };
  });
}

qbitRoute.get("/torrents", async (c) => {
  const torrents = await listQbitTorrents();
  return c.json({ torrents: enrichProviderNames(torrents) });
});

qbitRoute.get("/torrents/by-ref/:providerId/:torrentId", async (c) => {
  const torrent = await getQbitByRef(c.req.param("providerId"), c.req.param("torrentId"));
  return c.json({ torrent: torrent ? enrichProviderNames([torrent])[0] : null });
});

qbitRoute.get("/torrents/:hash", async (c) => {
  const torrents = await listQbitTorrents();
  const torrent = torrents.find((entry) => entry.hash === c.req.param("hash")) ?? null;
  return c.json({ torrent: torrent ? enrichProviderNames([torrent])[0] : null });
});

qbitRoute.post("/torrents/:hash/:action", async (c) => {
  const action = c.req.param("action");
  if (!["pause", "resume", "recheck"].includes(action)) throw new ApiError(400, "Invalid action");
  const qbitAction = action === "pause" ? "stop" : action === "resume" ? "start" : "recheck";
  await controlQbitTorrent(qbitAction, c.req.param("hash"));
  recordEvent("info", "qbit", `qBittorrent ${action} requested`, { hash: c.req.param("hash") });
  return c.json({ message: action });
});

qbitRoute.delete("/torrents/:hash", async (c) => {
  const raw = c.req.query("deleteFiles");
  const deleteFiles = raw === undefined ? true : ["1", "true", "yes"].includes(raw.toLowerCase());
  const hash = c.req.param("hash");
  await deleteQbitTorrent(hash, deleteFiles);
  recordEvent("warning", "qbit", "Torrent removed from qBittorrent", { hash, deleteFiles });
  return c.json({ message: "deleted", hash, deleteFiles });
});
