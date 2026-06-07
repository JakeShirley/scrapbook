import { createRoute, z } from "@hono/zod-openapi";

import { assetListResponseSchema } from "./assets.js";
import { errorResponseSchema } from "./shared.js";

export const albumResponseSchema = z
  .object({
    id: z.string().openapi({ example: "album_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    title: z.string().openapi({ example: "Japan 2024" }),
    photoCount: z.number().int().nonnegative().openapi({ example: 42 }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("AlbumResponse");

export const albumListResponseSchema = z
  .object({
    albums: z.array(albumResponseSchema),
  })
  .openapi("AlbumListResponse");

export const albumCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .openapi("AlbumCreateRequest");

export const albumPatchRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .openapi("AlbumPatchRequest");

export const albumAssetsAddRequestSchema = z
  .object({
    assetIds: z.array(z.string().min(1)).min(1).max(240),
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();

    for (const [index, assetId] of input.assetIds.entries()) {
      if (seen.has(assetId)) {
        context.addIssue({
          code: "custom",
          message: "An asset can only appear once in the request",
          path: ["assetIds", index],
        });
      }

      seen.add(assetId);
    }
  })
  .openapi("AlbumAssetsAddRequest");

const albumParamsSchema = z.object({
  albumId: z
    .string()
    .min(1)
    .openapi({ param: { name: "albumId", in: "path" } }),
});

const albumAssetParamsSchema = albumParamsSchema.extend({
  assetId: z
    .string()
    .min(1)
    .openapi({ param: { name: "assetId", in: "path" } }),
});

const albumJsonResponses = {
  400: {
    description: "The album request is invalid.",
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
    description: "The album does not exist for the current account.",
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

export type AlbumResponse = z.infer<typeof albumResponseSchema>;
export type AlbumListResponse = z.infer<typeof albumListResponseSchema>;
export type AlbumCreateRequest = z.infer<typeof albumCreateRequestSchema>;
export type AlbumPatchRequest = z.infer<typeof albumPatchRequestSchema>;
export type AlbumAssetsAddRequest = z.infer<typeof albumAssetsAddRequestSchema>;

export const albumListRoute = createRoute({
  method: "get",
  path: "/api/v1/albums",
  tags: ["Albums"],
  responses: {
    200: {
      description: "Lists albums for the current account in title order.",
      content: {
        "application/json": {
          schema: albumListResponseSchema,
        },
      },
    },
    ...albumJsonResponses,
  },
});

export const albumCreateRoute = createRoute({
  method: "post",
  path: "/api/v1/albums",
  tags: ["Albums"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: albumCreateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Creates a new empty album.",
      content: {
        "application/json": {
          schema: albumResponseSchema,
        },
      },
    },
    ...albumJsonResponses,
  },
});

export const albumDetailRoute = createRoute({
  method: "get",
  path: "/api/v1/albums/{albumId}",
  tags: ["Albums"],
  request: {
    params: albumParamsSchema,
  },
  responses: {
    200: {
      description: "Returns metadata for a single album.",
      content: {
        "application/json": {
          schema: albumResponseSchema,
        },
      },
    },
    ...albumJsonResponses,
  },
});

export const albumPatchRoute = createRoute({
  method: "patch",
  path: "/api/v1/albums/{albumId}",
  tags: ["Albums"],
  request: {
    params: albumParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: albumPatchRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Updates album metadata (currently only the title).",
      content: {
        "application/json": {
          schema: albumResponseSchema,
        },
      },
    },
    ...albumJsonResponses,
  },
});

export const albumDeleteRoute = createRoute({
  method: "delete",
  path: "/api/v1/albums/{albumId}",
  tags: ["Albums"],
  request: {
    params: albumParamsSchema,
  },
  responses: {
    204: {
      description: "Deletes the album. Photos themselves are not deleted.",
    },
    ...albumJsonResponses,
  },
});

export const albumAssetListRoute = createRoute({
  method: "get",
  path: "/api/v1/albums/{albumId}/assets",
  tags: ["Albums"],
  request: {
    params: albumParamsSchema,
  },
  responses: {
    200: {
      description: "Lists assets in an album in newest-first added order.",
      content: {
        "application/json": {
          schema: assetListResponseSchema,
        },
      },
    },
    ...albumJsonResponses,
  },
});

export const albumAssetsAddRoute = createRoute({
  method: "post",
  path: "/api/v1/albums/{albumId}/assets",
  tags: ["Albums"],
  request: {
    params: albumParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: albumAssetsAddRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description:
        "Adds assets to an album. Assets already in the album are ignored. Returns the updated newest-first member list.",
      content: {
        "application/json": {
          schema: assetListResponseSchema,
        },
      },
    },
    ...albumJsonResponses,
  },
});

export const albumAssetRemoveRoute = createRoute({
  method: "delete",
  path: "/api/v1/albums/{albumId}/assets/{assetId}",
  tags: ["Albums"],
  request: {
    params: albumAssetParamsSchema,
  },
  responses: {
    204: {
      description: "Removes an asset from the album.",
    },
    ...albumJsonResponses,
  },
});

const assetAlbumsParamsSchema = z.object({
  assetId: z
    .string()
    .min(1)
    .openapi({ param: { name: "assetId", in: "path" } }),
});

export const assetAlbumsListRoute = createRoute({
  method: "get",
  path: "/api/v1/assets/{assetId}/albums",
  tags: ["Albums"],
  request: {
    params: assetAlbumsParamsSchema,
  },
  responses: {
    200: {
      description: "Lists every album the asset belongs to, in title order.",
      content: {
        "application/json": {
          schema: albumListResponseSchema,
        },
      },
    },
    ...albumJsonResponses,
  },
});
