import { OpenAPIHono } from "@hono/zod-openapi";
import {
  type AccountResponse,
  type AssetResponse,
  type AuthSessionResponse,
  assetDetailRoute,
  assetListResponseSchema,
  assetListRoute,
  assetOriginalContentRoute,
  assetResponseSchema,
  assetUploadRoute,
  assetVariantContentRoute,
  authSessionResponseSchema,
  currentSessionRoute,
  type ErrorResponse,
  healthResponseSchema,
  healthRoute,
  loginRoute,
  logoutRoute,
  pageCreateRoute,
  pageDeleteRoute,
  pageDetailRoute,
  pageDuplicateRoute,
  pageListResponseSchema,
  pageListRoute,
  pagePatchRoute,
  type PageResponse,
  pageResponseSchema,
  type PageSummaryResponse,
  pageSummaryResponseSchema,
  registerRoute,
  type SessionResponse,
} from "@scrapbook/api-contract";
import { createPageDocument, type PageDocument, pageDocumentSchema } from "@scrapbook/editor-core";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { type AssetStorage, AssetUploadError, createAssetFromUpload } from "./assets.js";
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
import type { Repositories, RepositoryClock } from "./persistence/repositories.js";
import type {
  AccountRecord,
  AssetRecord,
  AssetVariantRecord,
  PageRecord,
  SessionRecord,
} from "./persistence/schema.js";

type ApiBindings = {
  Variables: {
    requestId: string;
  };
};

const packageVersion = "0.0.0-development";

export type CreateAppOptions = {
  repositories?: Repositories;
  storage?: AssetStorage;
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

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const buildAssetOriginalContentUrl = (assetId: string): string =>
  `/api/v1/assets/${assetId}/content`;

const buildAssetVariantContentUrl = (assetId: string, variantId: string): string =>
  `/api/v1/assets/${assetId}/variants/${variantId}`;

const toAssetResponse = (asset: AssetRecord, variants: AssetVariantRecord[]): AssetResponse => {
  const thumbnail = variants.find((variant) => variant.kind === "thumbnail");

  return assetResponseSchema.parse({
    id: asset.id,
    byteSize: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    createdAt: asset.createdAt,
    height: asset.height,
    mimeType: asset.mimeType,
    originalContentUrl: buildAssetOriginalContentUrl(asset.id),
    originalFilename: asset.originalFilename,
    thumbnailUrl: thumbnail ? buildAssetVariantContentUrl(asset.id, thumbnail.id) : null,
    updatedAt: asset.updatedAt,
    variants: variants.map((variant) => ({
      id: variant.id,
      assetId: variant.assetId,
      byteSize: variant.byteSize,
      checksumSha256: variant.checksumSha256,
      contentUrl: buildAssetVariantContentUrl(asset.id, variant.id),
      createdAt: variant.createdAt,
      height: variant.height,
      kind: variant.kind,
      mimeType: variant.mimeType,
      updatedAt: variant.updatedAt,
      width: variant.width,
    })),
    width: asset.width,
  });
};

const parseStoredPageDocument = (page: PageRecord): PageDocument => {
  try {
    return pageDocumentSchema.parse(JSON.parse(page.documentJson));
  } catch {
    return createPageDocument({ canvas: { width: page.width, height: page.height } });
  }
};

const toPageSummaryResponse = (page: PageRecord): PageSummaryResponse => {
  const document = parseStoredPageDocument(page);

  return pageSummaryResponseSchema.parse({
    id: page.id,
    title: page.title,
    width: page.width,
    height: page.height,
    layerCount: document.layers.length,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  });
};

const toPageResponse = (page: PageRecord): PageResponse => {
  const document = parseStoredPageDocument(page);

  return pageResponseSchema.parse({
    ...toPageSummaryResponse(page),
    document,
  });
};

const validatePageDocumentAssets = (
  accountId: string,
  document: PageDocument,
  repositories: Repositories,
): boolean => {
  const assetIds = new Set(
    document.layers.filter((layer) => layer.kind === "photo").map((layer) => layer.assetId),
  );

  for (const assetId of assetIds) {
    if (!repositories.assets.findByIdForAccount(accountId, assetId)) {
      return false;
    }
  }

  return true;
};

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
    storage: createOptions.storage,
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

  app.openapi(assetUploadRoute, async (context) => {
    if (!options.repositories || !options.storage) {
      return context.json(
        createErrorResponse(context, "assets_unavailable", "Asset storage is unavailable"),
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

    let body: Record<string, unknown>;

    try {
      body = await context.req.parseBody();
    } catch {
      return context.json(
        createErrorResponse(context, "invalid_upload", "Upload must be multipart form data"),
        400,
      );
    }

    try {
      const result = await createAssetFromUpload({
        accountId: authSession.account.id,
        file: body.file,
        repositories: options.repositories,
        storage: options.storage,
      });

      return context.json(toAssetResponse(result.asset, result.variants), 201);
    } catch (error) {
      if (error instanceof AssetUploadError) {
        return context.json(createErrorResponse(context, error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.openapi(assetListRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "assets_unavailable", "Asset storage is unavailable"),
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

    const assets = options.repositories.assets
      .listForAccount(authSession.account.id)
      .map((asset) =>
        toAssetResponse(
          asset,
          options.repositories?.assets.listVariantsForAsset(authSession.account.id, asset.id) ?? [],
        ),
      );

    return context.json(assetListResponseSchema.parse({ assets }), 200);
  });

  app.openapi(assetDetailRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "assets_unavailable", "Asset storage is unavailable"),
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

    const { assetId } = context.req.valid("param");
    const asset = options.repositories.assets.findByIdForAccount(authSession.account.id, assetId);

    if (!asset) {
      return context.json(createErrorResponse(context, "asset_not_found", "Asset not found"), 404);
    }

    return context.json(
      toAssetResponse(
        asset,
        options.repositories.assets.listVariantsForAsset(authSession.account.id, asset.id),
      ),
      200,
    );
  });

  app.openapi(assetOriginalContentRoute, async (context) => {
    if (!options.repositories || !options.storage) {
      return context.json(
        createErrorResponse(context, "assets_unavailable", "Asset storage is unavailable"),
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

    const { assetId } = context.req.valid("param");
    const asset = options.repositories.assets.findByIdForAccount(authSession.account.id, assetId);

    if (!asset) {
      return context.json(createErrorResponse(context, "asset_not_found", "Asset not found"), 404);
    }

    const buffer = await options.storage.read(asset.originalStorageKey);

    return context.body(toArrayBuffer(buffer), 200, {
      "cache-control": "private, max-age=86400",
      "content-length": String(buffer.byteLength),
      "content-type": asset.mimeType,
    });
  });

  app.openapi(assetVariantContentRoute, async (context) => {
    if (!options.repositories || !options.storage) {
      return context.json(
        createErrorResponse(context, "assets_unavailable", "Asset storage is unavailable"),
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

    const { assetId, variantId } = context.req.valid("param");
    const asset = options.repositories.assets.findByIdForAccount(authSession.account.id, assetId);
    const variant = asset
      ? options.repositories.assets.findVariantByIdForAccount(
          authSession.account.id,
          asset.id,
          variantId,
        )
      : null;

    if (!asset || !variant) {
      return context.json(createErrorResponse(context, "asset_not_found", "Asset not found"), 404);
    }

    const buffer = await options.storage.read(variant.storageKey);

    return context.body(toArrayBuffer(buffer), 200, {
      "cache-control": "private, max-age=86400",
      "content-length": String(buffer.byteLength),
      "content-type": variant.mimeType,
    });
  });

  app.openapi(pageCreateRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "pages_unavailable", "Pages are unavailable"),
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

    const input = context.req.valid("json");
    const document = input.document ?? createPageDocument();

    if (!validatePageDocumentAssets(authSession.account.id, document, options.repositories)) {
      return context.json(
        createErrorResponse(
          context,
          "page_asset_not_found",
          "Photo layers must reference assets owned by the account",
        ),
        400,
      );
    }

    const page = options.repositories.pages.create({
      accountId: authSession.account.id,
      title: input.title?.trim() || "Untitled page",
      width: document.canvas.width,
      height: document.canvas.height,
      documentJson: JSON.stringify(document),
    });

    return context.json(toPageResponse(page), 201);
  });

  app.openapi(pageListRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "pages_unavailable", "Pages are unavailable"),
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

    const pages = options.repositories.pages
      .listForAccount(authSession.account.id)
      .map((page) => toPageSummaryResponse(page));

    return context.json(pageListResponseSchema.parse({ pages }), 200);
  });

  app.openapi(pageDetailRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "pages_unavailable", "Pages are unavailable"),
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

    const { pageId } = context.req.valid("param");
    const page = options.repositories.pages.findByIdForAccount(authSession.account.id, pageId);

    if (!page) {
      return context.json(createErrorResponse(context, "page_not_found", "Page not found"), 404);
    }

    return context.json(toPageResponse(page), 200);
  });

  app.openapi(pagePatchRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "pages_unavailable", "Pages are unavailable"),
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

    const { pageId } = context.req.valid("param");
    const input = context.req.valid("json");
    const existing = options.repositories.pages.findByIdForAccount(authSession.account.id, pageId);

    if (!existing) {
      return context.json(createErrorResponse(context, "page_not_found", "Page not found"), 404);
    }

    if (
      input.document &&
      !validatePageDocumentAssets(authSession.account.id, input.document, options.repositories)
    ) {
      return context.json(
        createErrorResponse(
          context,
          "page_asset_not_found",
          "Photo layers must reference assets owned by the account",
        ),
        400,
      );
    }

    const pageUpdate: Partial<Pick<PageRecord, "documentJson" | "height" | "title" | "width">> = {};

    if (input.title !== undefined) {
      pageUpdate.title = input.title.trim();
    }

    if (input.document) {
      pageUpdate.width = input.document.canvas.width;
      pageUpdate.height = input.document.canvas.height;
      pageUpdate.documentJson = JSON.stringify(input.document);
    }

    const page = options.repositories.pages.updateForAccount(
      authSession.account.id,
      pageId,
      pageUpdate,
    );

    if (!page) {
      return context.json(createErrorResponse(context, "page_not_found", "Page not found"), 404);
    }

    return context.json(toPageResponse(page), 200);
  });

  app.openapi(pageDuplicateRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "pages_unavailable", "Pages are unavailable"),
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

    const { pageId } = context.req.valid("param");
    const input = context.req.valid("json");
    const existing = options.repositories.pages.findByIdForAccount(authSession.account.id, pageId);

    if (!existing) {
      return context.json(createErrorResponse(context, "page_not_found", "Page not found"), 404);
    }

    const document = parseStoredPageDocument(existing);
    const page = options.repositories.pages.create({
      accountId: authSession.account.id,
      title: input.title?.trim() || `${existing.title} copy`,
      width: document.canvas.width,
      height: document.canvas.height,
      documentJson: JSON.stringify(document),
    });

    return context.json(toPageResponse(page), 201);
  });

  app.openapi(pageDeleteRoute, (context) => {
    if (!options.repositories) {
      return context.json(
        createErrorResponse(context, "pages_unavailable", "Pages are unavailable"),
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

    const { pageId } = context.req.valid("param");
    const deleted = options.repositories.pages.deleteByIdForAccount(authSession.account.id, pageId);

    if (!deleted) {
      return context.json(createErrorResponse(context, "page_not_found", "Page not found"), 404);
    }

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
