import { Hono } from "hono";
import { ApiError } from "../lib/errors";
import { getPrivateSettings } from "../services/settings";
import { testAi, verifyItems } from "../services/ai";
import { parseJson } from "../lib/http";
import { aiOverridesSchema, aiVerifySchema } from "./schemas";

export const aiRoute = new Hono();

aiRoute.post("/verify", async (c) => {
  const input = await parseJson(c, aiVerifySchema);
  try {
    const results = await verifyItems(input.target, input.items);
    return c.json({
      results,
      model: getPrivateSettings().ai.model,
      cachedCount: results.filter((result) => result.cached).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /disabled|not configured|API key is missing/i.test(message) ? 400 : 502;
    throw new ApiError(status, message);
  }
});

aiRoute.post("/test", async (c) => {
  const text = await c.req.text();
  let overrides: Record<string, string> = {};
  if (text.trim()) {
    try {
      const parsed = aiOverridesSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new ApiError(400, "Invalid request", parsed.error.flatten());
      overrides = Object.fromEntries(
        Object.entries(parsed.data).filter(([, value]) => typeof value === "string" && value !== ""),
      ) as Record<string, string>;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "Invalid JSON body");
    }
  }
  return c.json({ health: await testAi(overrides) });
});
