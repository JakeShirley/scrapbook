import { createRoute, z } from "@hono/zod-openapi";

import { errorResponseSchema } from "./shared.js";

export const assetVariantKindSchema = z.enum(["thumbnail", "preview", "render", "export"]);

export const assetVariantResponseSchema = z
  .object({
    id: z.string().openapi({ example: "asset_variant_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    assetId: z.string().openapi({ example: "asset_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    kind: assetVariantKindSchema.openapi({ example: "thumbnail" }),
    contentUrl: z
      .string()
      .openapi({ example: "/api/v1/assets/asset_123/variants/asset_variant_123" }),
    mimeType: z.string().openapi({ example: "image/jpeg" }),
    byteSize: z.number().int().nonnegative().openapi({ example: 24318 }),
    width: z.number().int().positive().nullable().openapi({ example: 360 }),
    height: z.number().int().positive().nullable().openapi({ example: 240 }),
    checksumSha256: z.string().openapi({ example: "sha256-hex" }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("AssetVariantResponse");

export const assetResponseSchema = z
  .object({
    id: z.string().openapi({ example: "asset_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    originalFilename: z.string().openapi({ example: "family-photo.jpg" }),
    mimeType: z.string().openapi({ example: "image/jpeg" }),
    byteSize: z.number().int().nonnegative().openapi({ example: 3810244 }),
    width: z.number().int().positive().nullable().openapi({ example: 4032 }),
    height: z.number().int().positive().nullable().openapi({ example: 3024 }),
    checksumSha256: z.string().openapi({ example: "sha256-hex" }),
    originalContentUrl: z.string().openapi({ example: "/api/v1/assets/asset_123/content" }),
    thumbnailUrl: z
      .string()
      .nullable()
      .openapi({ example: "/api/v1/assets/asset_123/variants/asset_variant_123" }),
    variants: z.array(assetVariantResponseSchema),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("AssetResponse");

export const assetListResponseSchema = z
  .object({
    assets: z.array(assetResponseSchema),
  })
  .openapi("AssetListResponse");

const assetParamsSchema = z.object({
  assetId: z
    .string()
    .min(1)
    .openapi({ param: { name: "assetId", in: "path" } }),
});

const assetVariantParamsSchema = assetParamsSchema.extend({
  variantId: z
    .string()
    .min(1)
    .openapi({ param: { name: "variantId", in: "path" } }),
});

const assetUploadRequestSchema = z
  .object({
    file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
  })
  .openapi("AssetUploadRequest");

const assetJsonResponses = {
  401: {
    description: "Authentication is required.",
    content: {
      "application/json": {
        schema: errorResponseSchema,
      },
    },
  },
  404: {
    description: "The asset does not exist for the current account.",
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

const assetBinaryContent = {
  "image/heic": {
    schema: z.string().openapi({ type: "string", format: "binary" }),
  },
  "image/jpeg": {
    schema: z.string().openapi({ type: "string", format: "binary" }),
  },
  "image/png": {
    schema: z.string().openapi({ type: "string", format: "binary" }),
  },
  "image/webp": {
    schema: z.string().openapi({ type: "string", format: "binary" }),
  },
};

export type AssetVariantKind = z.infer<typeof assetVariantKindSchema>;
export type AssetVariantResponse = z.infer<typeof assetVariantResponseSchema>;
export type AssetResponse = z.infer<typeof assetResponseSchema>;
export type AssetListResponse = z.infer<typeof assetListResponseSchema>;

export const assetUploadRoute = createRoute({
  method: "post",
  path: "/api/v1/assets/uploads",
  tags: ["Assets"],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: assetUploadRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Uploads an original image and creates a thumbnail variant.",
      content: {
        "application/json": {
          schema: assetResponseSchema,
        },
      },
    },
    400: {
      description: "The upload is missing, too large, unsupported, or has invalid dimensions.",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    413: {
      description: "The uploaded image exceeds the configured size limit.",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...assetJsonResponses,
  },
});

export const assetListRoute = createRoute({
  method: "get",
  path: "/api/v1/assets",
  tags: ["Assets"],
  responses: {
    200: {
      description: "Lists assets owned by the current account.",
      content: {
        "application/json": {
          schema: assetListResponseSchema,
        },
      },
    },
    ...assetJsonResponses,
  },
});

export const assetDetailRoute = createRoute({
  method: "get",
  path: "/api/v1/assets/{assetId}",
  tags: ["Assets"],
  request: {
    params: assetParamsSchema,
  },
  responses: {
    200: {
      description: "Returns asset metadata and variant links for the current account.",
      content: {
        "application/json": {
          schema: assetResponseSchema,
        },
      },
    },
    ...assetJsonResponses,
  },
});

export const assetOriginalContentRoute = createRoute({
  method: "get",
  path: "/api/v1/assets/{assetId}/content",
  tags: ["Assets"],
  request: {
    params: assetParamsSchema,
  },
  responses: {
    200: {
      description: "Streams the original asset file for the current account.",
      content: assetBinaryContent,
    },
    ...assetJsonResponses,
  },
});

export const assetVariantContentRoute = createRoute({
  method: "get",
  path: "/api/v1/assets/{assetId}/variants/{variantId}",
  tags: ["Assets"],
  request: {
    params: assetVariantParamsSchema,
  },
  responses: {
    200: {
      description: "Streams an asset variant file for the current account.",
      content: assetBinaryContent,
    },
    ...assetJsonResponses,
  },
});
