import { resolve } from "node:path";

import { z } from "zod";

const runtimeConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
    SCRAPBOOK_DATA_DIR: z.string().min(1).default("./storage/dev"),
  })
  .transform((config) => ({
    ...config,
    SCRAPBOOK_DATA_DIR: resolve(config.SCRAPBOOK_DATA_DIR),
  }));

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): RuntimeConfig =>
  runtimeConfigSchema.parse(environment);
