import { Hono } from "hono";
import { ApiError } from "../lib/errors";
import {
  downloadMovie,
  getMovieDownloadState,
  getMovieOverview,
} from "../services/movie";
import { movieDownloadSchema } from "./schemas";

export const moviesRoute = new Hono();

moviesRoute.get("/:tmdbId", async (c) => {
  const tmdbId = Number(c.req.param("tmdbId"));
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new ApiError(400, "Invalid TMDB id");
  return c.json(await getMovieOverview(tmdbId));
});

moviesRoute.post("/:tmdbId/download", async (c) => {
  const tmdbId = Number(c.req.param("tmdbId"));
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new ApiError(400, "Invalid TMDB id");
  const text = await c.req.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }
  }
  const parsed = movieDownloadSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, "Invalid request", parsed.error.flatten());
  return c.json({
    download: await downloadMovie(tmdbId, parsed.data.quality ?? "", parsed.data.providerId),
  });
});

moviesRoute.get("/:tmdbId/download", async (c) => {
  const tmdbId = Number(c.req.param("tmdbId"));
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new ApiError(400, "Invalid TMDB id");
  return c.json({ download: await getMovieDownloadState(tmdbId) });
});
