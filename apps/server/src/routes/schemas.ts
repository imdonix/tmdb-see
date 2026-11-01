import { z } from "zod";

export const mediaTargetSchema = z.object({
  type: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().nonnegative(),
  title: z.string().min(1),
  year: z.string().optional(),
  season: z.number().int().optional(),
  episode: z.number().int().optional(),
  quality: z.string().optional(),
});

export const searchSchema = z.object({
  query: z.string().optional().default(""),
  providerIds: z.array(z.string()).optional(),
  category: z.string().optional(),
  where: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  sortBy: z.enum(["seeders", "leechers", "size", "date", "title"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  target: mediaTargetSchema.optional(),
});

export const followCreateSchema = z.object({
  tmdbId: z.number().int().positive(),
  quality: z.string().optional(),
  skippedSeasons: z.array(z.number().int()).optional(),
});

export const followUpdateSchema = z.object({
  quality: z.string().optional(),
  status: z.string().optional(),
  skippedSeasons: z.array(z.number().int()).optional(),
});

export const movieDownloadSchema = z.object({
  quality: z.string().optional(),
  providerId: z.string().optional(),
});

export const providerWriteSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  kind: z.enum(["ncore", "torznab"]),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  config: z.record(z.unknown()),
});

export const providerPatchSchema = providerWriteSchema.partial();

export const aiVerifySchema = z.object({
  target: mediaTargetSchema,
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        providerId: z.string().optional(),
        title: z.string().min(1),
        size: z.number().optional(),
      }),
    )
    .min(1)
    .max(12),
});

export const grabSchema = z.object({
  target: mediaTargetSchema.optional(),
});

export const qbitOverridesSchema = z.object({
  host: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const aiOverridesSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

const settingsSection = <T extends z.ZodRawShape>(shape: T) => z.object(shape).partial().optional();

export const settingsUpdateSchema = z.object({
  tmdb: settingsSection({
    apiKey: z.string(),
    language: z.string(),
  }),
  qbit: settingsSection({
    host: z.string(),
    username: z.string(),
    password: z.string(),
    savePath: z.string(),
    organize: z.boolean(),
  }),
  ai: settingsSection({
    enabled: z.boolean(),
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    verifyDownloads: z.boolean(),
    verifyFollows: z.boolean(),
    threshold: z.number(),
  }),
  app: settingsSection({
    followIntervalMinutes: z.number(),
    defaultQuality: z.enum(["2160p", "1080p", "720p"]),
    searchPageSize: z.number(),
  }),
});
