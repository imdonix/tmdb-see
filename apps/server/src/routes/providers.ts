import { Hono } from "hono";
import type { TrackerActivityItem } from "@tmdb-see/shared";
import { providerManager } from "../providers/manager";
import { publicTorrent } from "../providers/types";
import { clearMovieReleaseCache } from "../services/movie";
import { recordEvent } from "../services/events";
import { parseJson } from "../lib/http";
import { ApiError } from "../lib/errors";
import { providerPatchSchema, providerWriteSchema } from "./schemas";

export const providersRoute = new Hono();

function asProviderError(error: unknown): never {
  throw new ApiError(400, error instanceof Error ? error.message : String(error));
}

providersRoute.get("/", async (c) => {
  return c.json({ providers: await providerManager.listPublic() });
});

providersRoute.get("/admin", async (c) => {
  return c.json({ providers: await providerManager.listAdmin() });
});

providersRoute.post("/", async (c) => {
  const input = await parseJson(c, providerWriteSchema);
  try {
    const provider = await providerManager.create(input);
    clearMovieReleaseCache();
    recordEvent("success", "provider", `Added provider ${provider.name}`, { kind: provider.kind });
    return c.json({ provider }, 201);
  } catch (error) {
    return asProviderError(error);
  }
});

providersRoute.patch("/:id", async (c) => {
  const input = await parseJson(c, providerPatchSchema);
  try {
    const provider = await providerManager.update(c.req.param("id"), input);
    clearMovieReleaseCache();
    recordEvent("info", "provider", `Updated provider ${provider.name}`);
    return c.json({ provider });
  } catch (error) {
    return asProviderError(error);
  }
});

providersRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const providers = await providerManager.listAdmin();
    const provider = providers.find((entry) => entry.id === id);
    await providerManager.remove(id);
    clearMovieReleaseCache();
    recordEvent("warning", "provider", `Deleted provider ${provider?.name ?? id}`);
    return c.json({ message: "deleted" });
  } catch (error) {
    return asProviderError(error);
  }
});

providersRoute.post("/:id/test", async (c) => {
  try {
    const health = await providerManager.test(c.req.param("id"));
    if (!health.ok) recordEvent("warning", "provider", `Provider test failed`, { id: c.req.param("id"), error: health.message });
    return c.json({ health });
  } catch (error) {
    return asProviderError(error);
  }
});

providersRoute.get("/:id/activity", async (c) => {
  const id = c.req.param("id");
  const adapter = providerManager.getAdapter(id);
  if (!adapter) throw new ApiError(404, "Provider not found");
  if (!adapter.activity) throw new ApiError(400, "This provider does not expose activity");
  const provider = (await providerManager.listPublic()).find((entry) => entry.id === id) ?? null;
  const activity: TrackerActivityItem[] = await adapter.activity();
  return c.json({ provider, activity });
});

providersRoute.get("/:id/recommended", async (c) => {
  const id = c.req.param("id");
  const adapter = providerManager.getAdapter(id);
  if (!adapter) throw new ApiError(404, "Provider not found");
  if (!adapter.recommended) throw new ApiError(400, "This provider does not expose recommendations");
  const provider = (await providerManager.listPublic()).find((entry) => entry.id === id) ?? null;
  const items = (await adapter.recommended()).map(publicTorrent);
  return c.json({ provider, items });
});
