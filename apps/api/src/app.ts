import { OpenAPIHono } from "@hono/zod-openapi";
import {
  type AccountResponse,
  type AuthSessionResponse,
  type ErrorResponse,
  type SessionResponse,
  authSessionResponseSchema,
  currentSessionRoute,
  healthResponseSchema,
  healthRoute,
  loginRoute,
  logoutRoute,
  registerRoute,
} from "@scrapbook/api-contract";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import {
  createSessionCookieValue,
  createSessionSecret,
  defaultSessionTtlMs,
  hashPassword,
  hashSessionSecret,
  normalizeEmail,
  parseSessionCookieValue,
  sessionCookieName,
  verifyPassword,
} from "./auth.js";
import type { RepositoryClock, Repositories } from "./persistence/repositories.js";
import type { AccountRecord, SessionRecord } from "./persistence/schema.js";

type ApiBindings = {
  Variables: {
    requestId: string;
  };
};

const packageVersion = "0.0.0-development";

export type CreateAppOptions = {
  repositories?: Repositories;
  clock?: RepositoryClock;
  sessionCookieSecure?: boolean;
  sessionTtlMs?: number;
};

type ApiContext = Context<ApiBindings>;

type AuthenticatedSession = {
  account: AccountRecord;
  session: SessionRecord;
};

const defaultClock: RepositoryClock = () => new Date();

const createErrorResponse = (
  context: ApiContext,
  code: string,
  message: string,
): ErrorResponse => ({
  error: {
    code,
    message,
    requestId: context.get("requestId"),
  },
});

const toAccountResponse = (account: AccountRecord): AccountResponse => ({
  id: account.id,
  displayName: account.displayName,
  primaryEmail: account.primaryEmail,
});

const toSessionResponse = (session: SessionRecord): SessionResponse => ({
  id: session.id,
  expiresAt: session.expiresAt,
  createdAt: session.createdAt,
});

const toAuthSessionResponse = (authSession: AuthenticatedSession): AuthSessionResponse =>
  authSessionResponseSchema.parse({
    account: toAccountResponse(authSession.account),
    session: toSessionResponse(authSession.session),
  });

const readClientIp = (context: ApiContext): string | null => {
  const forwardedFor = context.req.header("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return context.req.header("x-real-ip") ?? null;
};

const startBrowserSession = (
  context: ApiContext,
  accountId: string,
  options: Required<Pick<CreateAppOptions, "clock" | "sessionCookieSecure" | "sessionTtlMs">> & {
    repositories: Repositories;
  },
): SessionRecord => {
  const secret = createSessionSecret();
  const expiresAt = new Date(options.clock().getTime() + options.sessionTtlMs).toISOString();
  const session = options.repositories.sessions.create({
    accountId,
    secretHash: hashSessionSecret(secret),
    expiresAt,
    userAgent: context.req.header("user-agent") ?? null,
    ipAddress: readClientIp(context),
  });

  setCookie(
    context,
    sessionCookieName,
    createSessionCookieValue({ sessionId: session.id, secret }),
    {
      expires: new Date(expiresAt),
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: options.sessionCookieSecure,
    },
  );

  return session;
};

const getAuthenticatedSession = (
  context: ApiContext,
  repositories: Repositories,
): AuthenticatedSession | null => {
  const cookieParts = parseSessionCookieValue(getCookie(context, sessionCookieName));

  if (!cookieParts) {
    return null;
  }

  const session = repositories.sessions.findActiveById(cookieParts.sessionId);

  if (!session || session.secretHash !== hashSessionSecret(cookieParts.secret)) {
    return null;
  }

  const account = repositories.accounts.findById(session.accountId);

  if (!account) {
    return null;
  }

  return { account, session };
};

export const createApp = (createOptions: CreateAppOptions = {}) => {
  const app = new OpenAPIHono<ApiBindings>();
  const options = {
    clock: createOptions.clock ?? defaultClock,
    repositories: createOptions.repositories,
    sessionCookieSecure: createOptions.sessionCookieSecure ?? false,
    sessionTtlMs: createOptions.sessionTtlMs ?? defaultSessionTtlMs,
  };

  app.use("*", async (context, next) => {
    const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();

    context.set("requestId", requestId);
    await next();
    context.header("x-request-id", requestId);
  });

  app.openapi(healthRoute, (context) => {
    const body = healthResponseSchema.parse({
      status: "ok",
      service: "scrapbook-api",
      version: packageVersion,
      timestamp: new Date().toISOString(),
    });

    return context.json(body, 200);
  });

  app.openapi(registerRoute, async (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "auth_unavailable", "Auth is unavailable"),
        500,
      );
    }

    const input = context.req.valid("json");
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    const existingAccount = options.repositories.accounts.findByPrimaryEmail(email);
    const existingIdentity = options.repositories.authIdentities.findByProviderSubject(
      "email_password",
      email,
    );

    if (existingAccount || existingIdentity) {
      return context.json(
        createErrorResponse(
          context,
          "email_already_registered",
          "An account already exists for this email",
        ),
        409,
      );
    }

    const account = options.repositories.accounts.create({ displayName, primaryEmail: email });
    options.repositories.authIdentities.create({
      accountId: account.id,
      provider: "email_password",
      providerSubject: email,
      passwordHash: await hashPassword(input.password),
    });
    const session = startBrowserSession(context, account.id, {
      ...options,
      repositories: options.repositories,
    });

    return context.json(toAuthSessionResponse({ account, session }), 201);
  });

  app.openapi(loginRoute, async (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "auth_unavailable", "Auth is unavailable"),
        500,
      );
    }

    const input = context.req.valid("json");
    const email = normalizeEmail(input.email);
    const identity = options.repositories.authIdentities.findByProviderSubject(
      "email_password",
      email,
    );
    const account = identity ? options.repositories.accounts.findById(identity.accountId) : null;
    const passwordMatches = identity?.passwordHash
      ? await verifyPassword(input.password, identity.passwordHash)
      : false;

    if (!identity || !account || !passwordMatches) {
      return context.json(
        createErrorResponse(context, "invalid_credentials", "Email or password is incorrect"),
        401,
      );
    }

    const session = startBrowserSession(context, account.id, {
      ...options,
      repositories: options.repositories,
    });

    return context.json(toAuthSessionResponse({ account, session }), 200);
  });

  app.openapi(currentSessionRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "auth_unavailable", "Auth is unavailable"),
        500,
      );
    }

    const authSession = getAuthenticatedSession(context, options.repositories);

    if (!authSession) {
      return context.json(
        createErrorResponse(context, "not_authenticated", "Authentication is required"),
        401,
      );
    }

    return context.json(toAuthSessionResponse(authSession), 200);
  });

  app.openapi(logoutRoute, (context) => {
    if (options.repositories) {
      const authSession = getAuthenticatedSession(context, options.repositories);

      if (authSession) {
        options.repositories.sessions.revokeByIdForAccount(
          authSession.account.id,
          authSession.session.id,
        );
      }
    }

    deleteCookie(context, sessionCookieName, { path: "/" });

    return context.body(null, 204);
  });

  app.doc("/api/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Scrapbook API",
      version: packageVersion,
    },
  });

  app.notFound((context) => {
    const body: ErrorResponse = {
      error: {
        code: "not_found",
        message: "Route not found",
        requestId: context.get("requestId"),
      },
    };

    return context.json(body, 404);
  });

  app.onError((error, context) => {
    console.error(error);

    const body: ErrorResponse = {
      error: {
        code: "internal_error",
        message: "Unexpected server error",
        requestId: context.get("requestId"),
      },
    };

    return context.json(body, 500);
  });

  return app;
};
