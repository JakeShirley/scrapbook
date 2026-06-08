import { createRoute, z } from "@hono/zod-openapi";

import { errorResponseSchema } from "./shared.js";

export const stickerPackResponseSchema = z
  .object({
    id: z.string().openapi({ example: "sticker_pack_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    title: z.string().openapi({ example: "Hand-drawn florals" }),
    author: z.string().nullable().openapi({ example: "Alex Designer" }),
    sourceUrl: z.string().nullable().openapi({ example: "https://example.com/sticker-pack" }),
    stickerCount: z.number().int().nonnegative().openapi({ example: 24 }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("StickerPackResponse");

export const stickerPackListResponseSchema = z
  .object({
    packs: z.array(stickerPackResponseSchema),
  })
  .openapi("StickerPackListResponse");

export const customStickerResponseSchema = z
  .object({
    id: z.string().openapi({ example: "custom_sticker_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    packId: z.string().openapi({ example: "sticker_pack_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    name: z.string().openapi({ example: "Daisy" }),
    mimeType: z.string().openapi({ example: "image/png" }),
    byteSize: z.number().int().nonnegative().openapi({ example: 12_834 }),
    width: z.number().int().positive().nullable().openapi({ example: 512 }),
    height: z.number().int().positive().nullable().openapi({ example: 512 }),
    contentUrl: z
      .string()
      .openapi({ example: "/api/v1/custom-stickers/custom_sticker_018.../content" }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("CustomStickerResponse");

export const customStickerListResponseSchema = z
  .object({
    stickers: z.array(customStickerResponseSchema),
  })
  .openapi("CustomStickerListResponse");

const optionalTrimmedField = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === null || value === undefined) {
        return value ?? null;
      }
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    });

export const stickerPackCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    author: optionalTrimmedField(120),
    sourceUrl: optionalTrimmedField(2048),
  })
  .openapi("StickerPackCreateRequest");

export const stickerPackPatchRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    author: optionalTrimmedField(120),
    sourceUrl: optionalTrimmedField(2048),
  })
  .openapi("StickerPackPatchRequest");

const stickerPackParamsSchema = z.object({
  packId: z
    .string()
    .min(1)
    .openapi({ param: { name: "packId", in: "path" } }),
});

const stickerPackStickerParamsSchema = z.object({
  packId: z
    .string()
    .min(1)
    .openapi({ param: { name: "packId", in: "path" } }),
  stickerId: z
    .string()
    .min(1)
    .openapi({ param: { name: "stickerId", in: "path" } }),
});

const customStickerParamsSchema = z.object({
  stickerId: z
    .string()
    .min(1)
    .openapi({ param: { name: "stickerId", in: "path" } }),
});

const customStickerListQuerySchema = z.object({
  packId: z
    .string()
    .min(1)
    .optional()
    .openapi({ param: { name: "packId", in: "query" } }),
});

const customStickerUploadRequestSchema = z
  .object({
    file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .openapi("CustomStickerUploadRequest");

const stickerPackJsonResponses = {
  400: {
    description: "The sticker pack request is invalid.",
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
    description: "The sticker pack does not exist for the current account.",
    content: {
      "application/json": {
        schema: errorResponseSchema,
      },
    },
  },
  413: {
    description: "The uploaded sticker image exceeds the configured size limit.",
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

export type StickerPackResponse = z.infer<typeof stickerPackResponseSchema>;
export type StickerPackListResponse = z.infer<typeof stickerPackListResponseSchema>;
export type CustomStickerResponse = z.infer<typeof customStickerResponseSchema>;
export type CustomStickerListResponse = z.infer<typeof customStickerListResponseSchema>;
export type StickerPackCreateRequest = z.infer<typeof stickerPackCreateRequestSchema>;
export type StickerPackPatchRequest = z.infer<typeof stickerPackPatchRequestSchema>;

export const stickerPackListRoute = createRoute({
  method: "get",
  path: "/api/v1/sticker-packs",
  tags: ["StickerPacks"],
  responses: {
    200: {
      description: "Lists sticker packs for the current account in title order.",
      content: {
        "application/json": {
          schema: stickerPackListResponseSchema,
        },
      },
    },
    ...stickerPackJsonResponses,
  },
});

export const stickerPackCreateRoute = createRoute({
  method: "post",
  path: "/api/v1/sticker-packs",
  tags: ["StickerPacks"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: stickerPackCreateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Creates a new empty sticker pack.",
      content: {
        "application/json": {
          schema: stickerPackResponseSchema,
        },
      },
    },
    ...stickerPackJsonResponses,
  },
});

export const stickerPackDetailRoute = createRoute({
  method: "get",
  path: "/api/v1/sticker-packs/{packId}",
  tags: ["StickerPacks"],
  request: {
    params: stickerPackParamsSchema,
  },
  responses: {
    200: {
      description: "Returns metadata for a single sticker pack.",
      content: {
        "application/json": {
          schema: stickerPackResponseSchema,
        },
      },
    },
    ...stickerPackJsonResponses,
  },
});

export const stickerPackPatchRoute = createRoute({
  method: "patch",
  path: "/api/v1/sticker-packs/{packId}",
  tags: ["StickerPacks"],
  request: {
    params: stickerPackParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: stickerPackPatchRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Updates sticker pack metadata.",
      content: {
        "application/json": {
          schema: stickerPackResponseSchema,
        },
      },
    },
    ...stickerPackJsonResponses,
  },
});

export const stickerPackDeleteRoute = createRoute({
  method: "delete",
  path: "/api/v1/sticker-packs/{packId}",
  tags: ["StickerPacks"],
  request: {
    params: stickerPackParamsSchema,
  },
  responses: {
    204: {
      description: "Deletes the sticker pack and every custom sticker it contains.",
    },
    ...stickerPackJsonResponses,
  },
});

export const stickerPackStickerListRoute = createRoute({
  method: "get",
  path: "/api/v1/sticker-packs/{packId}/stickers",
  tags: ["StickerPacks"],
  request: {
    params: stickerPackParamsSchema,
  },
  responses: {
    200: {
      description: "Lists custom stickers in a pack in upload order.",
      content: {
        "application/json": {
          schema: customStickerListResponseSchema,
        },
      },
    },
    ...stickerPackJsonResponses,
  },
});

export const stickerPackStickerUploadRoute = createRoute({
  method: "post",
  path: "/api/v1/sticker-packs/{packId}/stickers",
  tags: ["StickerPacks"],
  request: {
    params: stickerPackParamsSchema,
    body: {
      content: {
        "multipart/form-data": {
          schema: customStickerUploadRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Uploads a custom sticker image into the pack.",
      content: {
        "application/json": {
          schema: customStickerResponseSchema,
        },
      },
    },
    ...stickerPackJsonResponses,
  },
});

export const stickerPackStickerRemoveRoute = createRoute({
  method: "delete",
  path: "/api/v1/sticker-packs/{packId}/stickers/{stickerId}",
  tags: ["StickerPacks"],
  request: {
    params: stickerPackStickerParamsSchema,
  },
  responses: {
    204: {
      description: "Removes a custom sticker from the pack.",
    },
    ...stickerPackJsonResponses,
  },
});

export const customStickerListRoute = createRoute({
  method: "get",
  path: "/api/v1/custom-stickers",
  tags: ["StickerPacks"],
  request: {
    query: customStickerListQuerySchema,
  },
  responses: {
    200: {
      description:
        "Lists every custom sticker for the current account, optionally filtered by pack.",
      content: {
        "application/json": {
          schema: customStickerListResponseSchema,
        },
      },
    },
    ...stickerPackJsonResponses,
  },
});

const customStickerBinaryContent = {
  "image/png": { schema: z.string().openapi({ type: "string", format: "binary" }) },
  "image/jpeg": { schema: z.string().openapi({ type: "string", format: "binary" }) },
  "image/webp": { schema: z.string().openapi({ type: "string", format: "binary" }) },
  "image/gif": { schema: z.string().openapi({ type: "string", format: "binary" }) },
  "image/svg+xml": { schema: z.string().openapi({ type: "string", format: "binary" }) },
};

export const customStickerContentRoute = createRoute({
  method: "get",
  path: "/api/v1/custom-stickers/{stickerId}/content",
  tags: ["StickerPacks"],
  request: {
    params: customStickerParamsSchema,
  },
  responses: {
    200: {
      description: "Returns the raw image bytes for a custom sticker.",
      content: customStickerBinaryContent,
    },
    ...stickerPackJsonResponses,
  },
});
