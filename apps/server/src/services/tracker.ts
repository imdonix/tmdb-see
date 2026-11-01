import { isQbitComplete } from "@tmdb-see/shared";
import { listMovieDownloadRows, updateMovieDownload } from "../db/movies";
import { logger } from "../lib/logger";
import { recordEvent } from "./events";
import { syncFollowTracking } from "./follow";
import { listQbitTorrents } from "./qbit";

let tracking = false;

export async function syncTrackedDownloads(): Promise<void> {
  if (tracking) return;
  tracking = true;
  try {
    const torrents = await listQbitTorrents();
    const byRef = new Map(
      torrents
        .filter((torrent) => torrent.ref?.providerId && torrent.ref?.torrentId)
        .map((torrent) => [`${torrent.ref!.providerId}:${torrent.ref!.torrentId}`, torrent]),
    );

    for (const movie of listMovieDownloadRows()) {
      if (movie.status === "completed") continue;
      const torrent = byRef.get(`${movie.provider_id}:${movie.torrent_id}`);
      if (!torrent) {
        if (Date.now() - new Date(movie.updated_at).getTime() > 3 * 60 * 1000) {
          if (movie.status !== "missing") {
            updateMovieDownload(movie.tmdb_id, { status: "missing" });
            recordEvent("warning", "movie", `Torrent disappeared for TMDB movie ${movie.tmdb_id}`, {
              title: movie.torrent_title,
            });
          }
        }
        continue;
      }
      if (isQbitComplete(torrent)) {
        updateMovieDownload(movie.tmdb_id, { status: "completed", qbit_hash: torrent.hash });
        recordEvent("success", "movie", `Finished downloading ${movie.torrent_title}`, {
          tmdbId: movie.tmdb_id,
          provider: movie.provider_id,
        });
      } else if (movie.qbit_hash !== torrent.hash) {
        updateMovieDownload(movie.tmdb_id, { qbit_hash: torrent.hash });
      }
    }

    await syncFollowTracking();
  } catch (error) {
    logger.debug("Download tracking cycle skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    tracking = false;
  }
}
