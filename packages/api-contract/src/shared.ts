import { z } from "@hono/zod-openapi";

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "internal_error" }),
      message: z.string().openapi({ example: "Unexpected server error" }),
      requestId: z.string().nullable().openapi({ example: "018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    }),
  })
  .openapi("ErrorResponse");

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
