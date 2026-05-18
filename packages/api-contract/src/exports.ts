import { createRoute, z } from "@hono/zod-openapi";

import { errorResponseSchema } from "./shared.js";

export const exportFormatSchema = z.enum(["png", "jpeg", "pdf"]);
export const exportPresetSchema = z.enum(["digital", "print"]);
export const exportStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);

export const exportJobResponseSchema = z
  .object({
    id: z.string().openapi({ example: "export_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    status: exportStatusSchema.openapi({ example: "completed" }),
    format: exportFormatSchema.openapi({ example: "png" }),
    preset: exportPresetSchema.openapi({ example: "digital" }),
    targetKind: z.enum(["page", "book"]).openapi({ example: "page" }),
    pageId: z.string().nullable().openapi({ example: "page_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    bookId: z.string().nullable().openapi({ example: null }),
    outputContentUrl: z
      .string()
      .nullable()
      .openapi({ example: "/api/v1/exports/export_123/content" }),
    errorMessage: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("ExportJobResponse");

export const exportCreateRequestSchema = z
  .object({
    format: exportFormatSchema.default("png"),
    preset: exportPresetSchema.default("digital"),
    pageId: z.string().min(1).optional(),
    bookId: z.string().min(1).optional(),
  })
  .refine((input) => Boolean(input.pageId) !== Boolean(input.bookId), {
    message: "Provide exactly one export target",
  })
  .openapi("ExportCreateRequest");

const exportParamsSchema = z.object({
  exportId: z
    .string()
    .min(1)
    .openapi({ param: { name: "exportId", in: "path" } }),
});

const exportJsonResponses = {
  400: {
    description: "The export request is invalid.",
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
  404: {
    description: "The export does not exist for the current account.",
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
};

export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportPreset = z.infer<typeof exportPresetSchema>;
export type ExportJobResponse = z.infer<typeof exportJobResponseSchema>;
export type ExportCreateRequest = z.infer<typeof exportCreateRequestSchema>;

export const exportCreateRoute = createRoute({
  method: "post",
  path: "/api/v1/exports",
  tags: ["Exports"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: exportCreateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Creates and runs a page or book image/PDF export for the current account.",
      content: {
        "application/json": {
          schema: exportJobResponseSchema,
        },
      },
    },
    ...exportJsonResponses,
  },
});

export const exportDetailRoute = createRoute({
  method: "get",
  path: "/api/v1/exports/{exportId}",
  tags: ["Exports"],
  request: {
    params: exportParamsSchema,
  },
  responses: {
    200: {
      description: "Returns export job status and output metadata.",
      content: {
        "application/json": {
          schema: exportJobResponseSchema,
        },
      },
    },
    ...exportJsonResponses,
  },
});

export const exportContentRoute = createRoute({
  method: "get",
  path: "/api/v1/exports/{exportId}/content",
  tags: ["Exports"],
  request: {
    params: exportParamsSchema,
  },
  responses: {
    200: {
      description: "Streams completed export output.",
      content: {
        "image/png": {
          schema: z.string().openapi({ format: "binary" }),
        },
        "image/jpeg": {
          schema: z.string().openapi({ format: "binary" }),
        },
        "application/pdf": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
    },
    ...exportJsonResponses,
  },
});
