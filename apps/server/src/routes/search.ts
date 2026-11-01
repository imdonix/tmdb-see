import { Hono } from "hono";
import { downloadTorrentFile, getTorrentDetail, grabTorrent, searchPublic } from "../services/search";
import { parseJson } from "../lib/http";
import { ApiError } from "../lib/errors";
import { grabSchema, searchSchema } from "./schemas";

export const searchRoute = new Hono();

searchRoute.post("/search", async (c) => {
  const input = await parseJson(c, searchSchema);
  return c.json(await searchPublic({ ...input, query: input.query ?? "" }));
});

searchRoute.get("/torrents/:providerId/:torrentId", async (c) => {
  const { providerId, torrentId } = c.req.param();
  const torrent = await getTorrentDetail(providerId, torrentId);
  if (!torrent) throw new ApiError(404, "Torrent not found. Search for it again.");
  return c.json({ torrent });
});

searchRoute.get("/torrents/:providerId/:torrentId/file", async (c) => {
  const { providerId, torrentId } = c.req.param();
  const result = await downloadTorrentFile(providerId, torrentId);
  const filename = result.filename.replace(/["\\]/g, "");
  const body = new Blob([result.data as unknown as BlobPart], { type: "application/x-bittorrent" });
  return new Response(body, {
    headers: {
      "content-type": "application/x-bittorrent",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});

searchRoute.post("/torrents/:providerId/:torrentId/grab", async (c) => {
  const { providerId, torrentId } = c.req.param();
  const text = await c.req.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }
  }
  const parsed = grabSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, "Invalid request", parsed.error.flatten());
  const result = await grabTorrent({ providerId, torrentId, target: parsed.data.target });
  return c.json({
    item: result.item,
    alreadyInQbit: result.alreadyInQbit,
    message: result.alreadyInQbit ? "Already in qBittorrent" : "Sent to qBittorrent",
  });
});
