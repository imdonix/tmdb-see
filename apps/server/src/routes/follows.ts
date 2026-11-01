import { Hono } from "hono";
import { config } from "../config";
import { ApiError } from "../lib/errors";
import { parseJson } from "../lib/http";
import { getFollowRowByTmdb } from "../db/follows";
import {
  checkAllFollows,
  checkFollow,
  createFollow,
  getFollowDetail,
  listFollows,
  scheduleFollowCheck,
  unfollow,
  updateFollow,
} from "../services/follow";
import { followCreateSchema, followUpdateSchema } from "./schemas";

export const followsRoute = new Hono();

function requireTmdbId(value: string | undefined): number {
  const tmdbId = Number(value);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new ApiError(400, "Invalid TMDB id");
  return tmdbId;
}

followsRoute.get("/", async (c) => {
  return c.json({ follows: await listFollows() });
});

followsRoute.post("/", async (c) => {
  const input = await parseJson(c, followCreateSchema);
  const follow = await createFollow(input.tmdbId, input.quality ?? "", input.skippedSeasons ?? []);
  if (!config.disableScheduler) scheduleFollowCheck(follow.id);
  return c.json({ follow });
});

followsRoute.post("/check-all", (c) => {
  setTimeout(() => {
    void checkAllFollows().catch(() => undefined);
  }, 50);
  return c.json({ message: "check started for all active follows" });
});

followsRoute.get("/:tmdbId", async (c) => {
  return c.json(await getFollowDetail(requireTmdbId(c.req.param("tmdbId"))));
});

followsRoute.patch("/:tmdbId", async (c) => {
  const input = await parseJson(c, followUpdateSchema);
  return c.json({ follow: await updateFollow(requireTmdbId(c.req.param("tmdbId")), input) });
});

followsRoute.delete("/:tmdbId", async (c) => {
  await unfollow(requireTmdbId(c.req.param("tmdbId")));
  return c.json({ message: "unfollowed" });
});

followsRoute.post("/:tmdbId/check", async (c) => {
  const tmdbId = requireTmdbId(c.req.param("tmdbId"));
  const row = getFollowRowByTmdb(tmdbId);
  if (!row) throw new ApiError(404, "Not following this series");
  const result = await checkFollow(row.id);
  const detail = await getFollowDetail(tmdbId);
  return c.json({ result, follow: detail.follow, items: detail.items });
});
