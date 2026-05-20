import { createRoute, z } from "@hono/zod-openapi";

import { errorResponseSchema } from "./shared.js";

export const serverLogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const serverLogQuerySchema = z.object({
  level: serverLogLevelSchema.default("debug").openapi({
    example: "info",
    param: { in: "query", name: "level" },
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(200)
    .openapi({
      example: 200,
      param: { in: "query", name: "limit" },
    }),
});

export const serverLogEntryResponseSchema = z
  .object({
    id: z.string().openapi({ example: "log_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    timestamp: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    level: serverLogLevelSchema.openapi({ example: "info" }),
    message: z.string().openapi({ example: "GET /api/v1/books completed with 200" }),
    requestId: z.string().nullable().openapi({ example: "req_018f4a0c" }),
    method: z.string().nullable().openapi({ example: "GET" }),
    path: z.string().nullable().openapi({ example: "/api/v1/books" }),
    status: z.number().int().positive().nullable().openapi({ example: 200 }),
    durationMs: z.number().nonnegative().nullable().openapi({ example: 18.4 }),
  })
  .openapi("ServerLogEntryResponse");

export const serverLogListResponseSchema = z
  .object({
    level: serverLogLevelSchema.openapi({ example: "info" }),
    logs: z.array(serverLogEntryResponseSchema),
  })
  .openapi("ServerLogListResponse");

export type ServerLogLevel = z.infer<typeof serverLogLevelSchema>;
export type ServerLogEntryResponse = z.infer<typeof serverLogEntryResponseSchema>;
export type ServerLogListResponse = z.infer<typeof serverLogListResponseSchema>;

export const serverLogListRoute = createRoute({
  method: "get",
  path: "/api/v1/logs",
  tags: ["Logs"],
  request: {
    query: serverLogQuerySchema,
  },
  responses: {
    200: {
      description: "Lists recent server log entries at or above the requested verbosity level.",
      content: {
        "application/json": {
          schema: serverLogListResponseSchema,
        },
      },
    },
    400: {
      description: "The log filter is invalid.",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Authentication is required.",
      content: {
        "application/json": {
          schema: errorResponseSchema,
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
