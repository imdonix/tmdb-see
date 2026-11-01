import { Hono } from "hono";
import { getOverview } from "../services/overview";

export const overviewRoute = new Hono();

overviewRoute.get("/", async (c) => {
  return c.json(await getOverview());
});
