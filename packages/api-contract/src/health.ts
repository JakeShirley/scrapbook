import { createRoute, z } from "@hono/zod-openapi";

import { errorResponseSchema } from "./shared.js";

export const healthResponseSchema = z
  .object({
    status: z.literal("ok").openapi({ example: "ok" }),
    service: z.literal("scrapbook-api").openapi({ example: "scrapbook-api" }),
    version: z.string().openapi({ example: "0.0.0-development" }),
    timestamp: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("HealthResponse");

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const healthRoute = createRoute({
  method: "get",
  path: "/api/v1/health",
  tags: ["Health"],
  responses: {
    200: {
      description: "Reports API liveness without exposing secrets.",
      content: {
        "application/json": {
          schema: healthResponseSchema,
        },
      },
    },
    500: {
      description: "Standard error envelope.",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});
