import { createRoute, z } from "@hono/zod-openapi";

import { errorResponseSchema } from "./shared.js";

export const accountResponseSchema = z
  .object({
    id: z.string().openapi({ example: "account_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    displayName: z.string().openapi({ example: "Ada Lovelace" }),
    primaryEmail: z.string().email().openapi({ example: "ada@example.com" }),
  })
  .openapi("AccountResponse");

export const sessionResponseSchema = z
  .object({
    id: z.string().openapi({ example: "session_018f4a0c-7b07-7f3d-9f37-3e67a0f5ad13" }),
    expiresAt: z.string().datetime().openapi({ example: "2026-06-16T12:00:00.000Z" }),
    createdAt: z.string().datetime().openapi({ example: "2026-05-17T12:00:00.000Z" }),
  })
  .openapi("SessionResponse");

export const authSessionResponseSchema = z
  .object({
    account: accountResponseSchema,
    session: sessionResponseSchema,
  })
  .openapi("AuthSessionResponse");

export const registerRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).openapi({ example: "Ada Lovelace" }),
    email: z.string().trim().email().max(320).openapi({ example: "ada@example.com" }),
    password: z.string().min(12).max(256).openapi({ example: "correct horse battery staple" }),
  })
  .openapi("RegisterRequest");

export const loginRequestSchema = z
  .object({
    email: z.string().trim().email().max(320).openapi({ example: "ada@example.com" }),
    password: z.string().min(1).max(256).openapi({ example: "correct horse battery staple" }),
  })
  .openapi("LoginRequest");

export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;

const jsonRequest = <Schema extends z.ZodType>(schema: Schema) => ({
  content: {
    "application/json": {
      schema,
    },
  },
  required: true,
});

const authResponses = {
  400: {
    description: "Request validation failed.",
    content: {
      "application/json": {
        schema: errorResponseSchema,
      },
    },
  },
  401: {
    description: "Authentication failed or is required.",
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

export const registerRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/register",
  tags: ["Auth"],
  request: {
    body: jsonRequest(registerRequestSchema),
  },
  responses: {
    201: {
      description: "Creates an account and starts a browser session.",
      content: {
        "application/json": {
          schema: authSessionResponseSchema,
        },
      },
    },
    409: {
      description: "An account already exists for this email address.",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    ...authResponses,
  },
});

export const loginRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/login",
  tags: ["Auth"],
  request: {
    body: jsonRequest(loginRequestSchema),
  },
  responses: {
    200: {
      description: "Starts a browser session for an existing account.",
      content: {
        "application/json": {
          schema: authSessionResponseSchema,
        },
      },
    },
    ...authResponses,
  },
});

export const currentSessionRoute = createRoute({
  method: "get",
  path: "/api/v1/auth/session",
  tags: ["Auth"],
  responses: {
    200: {
      description: "Returns the current authenticated browser session.",
      content: {
        "application/json": {
          schema: authSessionResponseSchema,
        },
      },
    },
    ...authResponses,
  },
});

export const logoutRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/logout",
  tags: ["Auth"],
  responses: {
    204: {
      description: "Revokes the current browser session.",
    },
    ...authResponses,
  },
});
