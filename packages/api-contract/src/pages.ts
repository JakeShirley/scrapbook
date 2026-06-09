import { createRoute, z } from "@hono/zod-openapi";
import { pageDocumentSchema } from "@zakka/editor-core";

import { errorResponseSchema } from "./shared.js";

export const pageSummaryResponseSchema = z
  .object({
    id: z.string().openapi({ example: "page_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    title: z.string().openapi({ example: "Summer cover" }),
    width: z.number().int().positive().openapi({ example: 2400 }),
    height: z.number().int().positive().openapi({ example: 3000 }),
    layerCount: z.number().int().nonnegative().openapi({ example: 3 }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("PageSummaryResponse");

export const pageResponseSchema = pageSummaryResponseSchema
  .extend({
    document: pageDocumentSchema,
  })
  .openapi("PageResponse");

export const pageListResponseSchema = z
  .object({
    pages: z.array(pageSummaryResponseSchema),
  })
  .openapi("PageListResponse");

export const pageCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    document: pageDocumentSchema.optional(),
  })
  .openapi("PageCreateRequest");

export const pagePatchRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    document: pageDocumentSchema.optional(),
  })
  .refine((input) => input.title !== undefined || input.document !== undefined, {
    message: "At least one field must be provided",
  })
  .openapi("PagePatchRequest");

export const pageDuplicateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .openapi("PageDuplicateRequest");

const pageParamsSchema = z.object({
  pageId: z
    .string()
    .min(1)
    .openapi({ param: { name: "pageId", in: "path" } }),
});

const pageJsonResponses = {
  400: {
    description: "The page request is invalid.",
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
    description: "The page does not exist for the current account.",
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

export type PageSummaryResponse = z.infer<typeof pageSummaryResponseSchema>;
export type PageResponse = z.infer<typeof pageResponseSchema>;
export type PageListResponse = z.infer<typeof pageListResponseSchema>;
export type PageCreateRequest = z.infer<typeof pageCreateRequestSchema>;
export type PagePatchRequest = z.infer<typeof pagePatchRequestSchema>;
export type PageDuplicateRequest = z.infer<typeof pageDuplicateRequestSchema>;

export const pageCreateRoute = createRoute({
  method: "post",
  path: "/api/v1/pages",
  tags: ["Pages"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: pageCreateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Creates a scrapbook page for the current account.",
      content: {
        "application/json": {
          schema: pageResponseSchema,
        },
      },
    },
    ...pageJsonResponses,
  },
});

export const pageListRoute = createRoute({
  method: "get",
  path: "/api/v1/pages",
  tags: ["Pages"],
  responses: {
    200: {
      description: "Lists pages owned by the current account.",
      content: {
        "application/json": {
          schema: pageListResponseSchema,
        },
      },
    },
    ...pageJsonResponses,
  },
});

export const pageDetailRoute = createRoute({
  method: "get",
  path: "/api/v1/pages/{pageId}",
  tags: ["Pages"],
  request: {
    params: pageParamsSchema,
  },
  responses: {
    200: {
      description: "Returns a page document owned by the current account.",
      content: {
        "application/json": {
          schema: pageResponseSchema,
        },
      },
    },
    ...pageJsonResponses,
  },
});

export const pagePatchRoute = createRoute({
  method: "patch",
  path: "/api/v1/pages/{pageId}",
  tags: ["Pages"],
  request: {
    params: pageParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: pagePatchRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Updates title or document data for a page owned by the current account.",
      content: {
        "application/json": {
          schema: pageResponseSchema,
        },
      },
    },
    ...pageJsonResponses,
  },
});

export const pageDuplicateRoute = createRoute({
  method: "post",
  path: "/api/v1/pages/{pageId}/duplicate",
  tags: ["Pages"],
  request: {
    params: pageParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: pageDuplicateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Duplicates a page document for the current account.",
      content: {
        "application/json": {
          schema: pageResponseSchema,
        },
      },
    },
    ...pageJsonResponses,
  },
});

export const pageDeleteRoute = createRoute({
  method: "delete",
  path: "/api/v1/pages/{pageId}",
  tags: ["Pages"],
  request: {
    params: pageParamsSchema,
  },
  responses: {
    204: {
      description: "Deletes a page owned by the current account.",
    },
    ...pageJsonResponses,
  },
});
