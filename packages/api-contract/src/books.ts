import { createRoute, z } from "@hono/zod-openapi";

import { pageSummaryResponseSchema } from "./pages.js";
import { errorResponseSchema } from "./shared.js";

export const bookPageResponseSchema = z
  .object({
    id: z.string().openapi({ example: "book_page_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    bookId: z.string().openapi({ example: "book_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    pageId: z.string().openapi({ example: "page_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    sortOrder: z.number().int().nonnegative().openapi({ example: 0 }),
    page: pageSummaryResponseSchema,
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("BookPageResponse");

export const bookSpreadResponseSchema = z
  .object({
    spreadIndex: z.number().int().nonnegative().openapi({ example: 1 }),
    kind: z.enum(["facing", "single"]).openapi({ example: "facing" }),
    leftPageId: z.string().nullable().openapi({ example: "page_left" }),
    rightPageId: z.string().nullable().openapi({ example: "page_right" }),
    pageIds: z.array(z.string()).openapi({ example: ["page_left", "page_right"] }),
  })
  .openapi("BookSpreadResponse");

export const bookSummaryResponseSchema = z
  .object({
    id: z.string().openapi({ example: "book_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    title: z.string().openapi({ example: "Summer book" }),
    pageCount: z.number().int().nonnegative().openapi({ example: 8 }),
    spreadCount: z.number().int().nonnegative().openapi({ example: 5 }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("BookSummaryResponse");

export const bookResponseSchema = bookSummaryResponseSchema
  .extend({
    pages: z.array(bookPageResponseSchema),
    spreads: z.array(bookSpreadResponseSchema),
  })
  .openapi("BookResponse");

export const bookListResponseSchema = z
  .object({
    books: z.array(bookSummaryResponseSchema),
  })
  .openapi("BookListResponse");

export const bookCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .openapi("BookCreateRequest");

export const bookPatchRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .openapi("BookPatchRequest");

export const bookSetPagesRequestSchema = z
  .object({
    pageIds: z.array(z.string().min(1)).max(240),
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();

    for (const [index, pageId] of input.pageIds.entries()) {
      if (seen.has(pageId)) {
        context.addIssue({
          code: "custom",
          message: "A page can only appear once in a book",
          path: ["pageIds", index],
        });
      }

      seen.add(pageId);
    }
  })
  .openapi("BookSetPagesRequest");

const bookParamsSchema = z.object({
  bookId: z
    .string()
    .min(1)
    .openapi({ param: { name: "bookId", in: "path" } }),
});

const bookJsonResponses = {
  400: {
    description: "The book request is invalid.",
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
    description: "The book does not exist for the current account.",
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

export type BookPageResponse = z.infer<typeof bookPageResponseSchema>;
export type BookSpreadResponse = z.infer<typeof bookSpreadResponseSchema>;
export type BookSummaryResponse = z.infer<typeof bookSummaryResponseSchema>;
export type BookResponse = z.infer<typeof bookResponseSchema>;
export type BookListResponse = z.infer<typeof bookListResponseSchema>;
export type BookCreateRequest = z.infer<typeof bookCreateRequestSchema>;
export type BookPatchRequest = z.infer<typeof bookPatchRequestSchema>;
export type BookSetPagesRequest = z.infer<typeof bookSetPagesRequestSchema>;

export const bookCreateRoute = createRoute({
  method: "post",
  path: "/api/v1/books",
  tags: ["Books"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: bookCreateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Creates an ordered scrapbook book for the current account.",
      content: {
        "application/json": {
          schema: bookResponseSchema,
        },
      },
    },
    ...bookJsonResponses,
  },
});

export const bookListRoute = createRoute({
  method: "get",
  path: "/api/v1/books",
  tags: ["Books"],
  responses: {
    200: {
      description: "Lists books owned by the current account.",
      content: {
        "application/json": {
          schema: bookListResponseSchema,
        },
      },
    },
    ...bookJsonResponses,
  },
});

export const bookDetailRoute = createRoute({
  method: "get",
  path: "/api/v1/books/{bookId}",
  tags: ["Books"],
  request: {
    params: bookParamsSchema,
  },
  responses: {
    200: {
      description: "Returns an ordered book with spread groupings.",
      content: {
        "application/json": {
          schema: bookResponseSchema,
        },
      },
    },
    ...bookJsonResponses,
  },
});

export const bookPatchRoute = createRoute({
  method: "patch",
  path: "/api/v1/books/{bookId}",
  tags: ["Books"],
  request: {
    params: bookParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: bookPatchRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Updates a book owned by the current account.",
      content: {
        "application/json": {
          schema: bookResponseSchema,
        },
      },
    },
    ...bookJsonResponses,
  },
});

export const bookSetPagesRoute = createRoute({
  method: "put",
  path: "/api/v1/books/{bookId}/pages",
  tags: ["Books"],
  request: {
    params: bookParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: bookSetPagesRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description:
        "Replaces the ordered page list for a book. Pages are grouped into left/right facing spreads in order, with an unpaired final page represented as a single spread.",
      content: {
        "application/json": {
          schema: bookResponseSchema,
        },
      },
    },
    ...bookJsonResponses,
  },
});
