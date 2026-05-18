import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  authSessionResponseSchema,
  bookResponseSchema,
  exportJobResponseSchema,
  healthResponseSchema,
  pageResponseSchema,
} from "@scrapbook/api-contract";
import { createPageDocument, createPhotoLayer, createTextLayer } from "@scrapbook/editor-core";
import { makeFixedClock } from "@scrapbook/test-utils";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createDatabaseConnection, type DatabaseConnection } from "./persistence/database.js";
import { runMigrations } from "./persistence/migrations.js";
import { createRepositories } from "./persistence/repositories.js";
import { createDiskStorage } from "./storage/disk.js";

const connections: DatabaseConnection[] = [];
const tempDirs: string[] = [];
const fixedDate = new Date("2026-05-17T12:00:00.000Z");

const createTestApp = () => {
  const connection = createDatabaseConnection({ databasePath: ":memory:" });
  connections.push(connection);
  runMigrations(connection.sqlite);

  return createApp({
    clock: makeFixedClock(fixedDate),
    repositories: createRepositories(connection.db, {
      clock: makeFixedClock(fixedDate),
    }),
  });
};

const createTestAppWithStorage = async () => {
  const connection = createDatabaseConnection({ databasePath: ":memory:" });
  const rootDir = await mkdtemp(join(tmpdir(), "scrapbook-api-assets-"));
  const storage = createDiskStorage({ rootDir });

  connections.push(connection);
  tempDirs.push(rootDir);
  runMigrations(connection.sqlite);
  await storage.ensureReady();

  return createApp({
    clock: makeFixedClock(fixedDate),
    repositories: createRepositories(connection.db, { clock: makeFixedClock(fixedDate) }),
    storage,
  });
};

const postJson = (
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  cookie?: string,
) =>
  app.request(path, {
    body: JSON.stringify(body),
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    method: "POST",
  });

const registerAccount = async (
  app: ReturnType<typeof createApp>,
  input: { displayName: string; email: string },
): Promise<string> => {
  const response = await postJson(app, "/api/v1/auth/register", {
    ...input,
    password: "correct horse battery staple",
  });

  expect(response.status).toBe(201);

  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
};

const createPng = (): Promise<Buffer> =>
  sharp({
    create: {
      background: { alpha: 1, b: 90, g: 160, r: 210 },
      channels: 4,
      height: 16,
      width: 24,
    },
  })
    .png()
    .toBuffer();

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const uploadImage = async (app: ReturnType<typeof createApp>, cookie: string, file: File) => {
  const form = new FormData();
  form.set("file", file);

  return app.request("/api/v1/assets/uploads", {
    body: form,
    headers: { cookie },
    method: "POST",
  });
};

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close();
  }
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("api app", () => {
  it("serves the health endpoint", async () => {
    const app = createApp();
    const response = await app.request("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();

    const body = healthResponseSchema.parse(await response.json());

    expect(body.status).toBe("ok");
    expect(body.service).toBe("scrapbook-api");
  });

  it("uses the shared error envelope for missing routes", async () => {
    const app = createApp();
    const response = await app.request("/missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: {
        code: "not_found",
        message: "Route not found",
      },
    });
  });

  it("registers an account and serves the current browser session", async () => {
    const app = createTestApp();
    const registerResponse = await postJson(app, "/api/v1/auth/register", {
      displayName: "Ada Lovelace",
      email: "Ada@example.com",
      password: "correct horse battery staple",
    });

    expect(registerResponse.status).toBe(201);
    const cookie = registerResponse.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toMatch(/^scrapbook_session=/);

    const registerBody = authSessionResponseSchema.parse(await registerResponse.json());

    expect(registerBody.account).toMatchObject({
      displayName: "Ada Lovelace",
      primaryEmail: "ada@example.com",
    });

    const sessionResponse = await app.request("/api/v1/auth/session", {
      headers: { cookie: cookie ?? "" },
    });

    expect(sessionResponse.status).toBe(200);
    expect(authSessionResponseSchema.parse(await sessionResponse.json()).session.id).toBe(
      registerBody.session.id,
    );
  });

  it("logs in, rejects duplicate registration, and logs out", async () => {
    const app = createTestApp();
    await postJson(app, "/api/v1/auth/register", {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct horse battery staple",
    });

    const duplicateResponse = await postJson(app, "/api/v1/auth/register", {
      displayName: "Ada Lovelace",
      email: "ADA@example.com",
      password: "correct horse battery staple",
    });
    const badLoginResponse = await postJson(app, "/api/v1/auth/login", {
      email: "ada@example.com",
      password: "incorrect password",
    });
    const loginResponse = await postJson(app, "/api/v1/auth/login", {
      email: "ada@example.com",
      password: "correct horse battery staple",
    });

    expect(duplicateResponse.status).toBe(409);
    expect(badLoginResponse.status).toBe(401);
    expect(loginResponse.status).toBe(200);

    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const logoutResponse = await postJson(app, "/api/v1/auth/logout", {}, cookie);
    const sessionResponse = await app.request("/api/v1/auth/session", {
      headers: { cookie },
    });

    expect(logoutResponse.status).toBe(204);
    expect(sessionResponse.status).toBe(401);
  });

  it("uploads images, stores metadata, lists assets, and streams original and thumbnail files", async () => {
    const app = await createTestAppWithStorage();
    const cookie = await registerAccount(app, {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    const image = await createPng();
    const uploadResponse = await uploadImage(
      app,
      cookie,
      new File([toArrayBuffer(image)], "family.png", { type: "image/png" }),
    );

    expect(uploadResponse.status).toBe(201);

    const uploaded = await uploadResponse.json();

    expect(uploaded).toMatchObject({
      originalFilename: "family.png",
      mimeType: "image/png",
      byteSize: image.byteLength,
      width: 24,
      height: 16,
    });
    expect(uploaded.thumbnailUrl).toBe(
      `/api/v1/assets/${uploaded.id}/variants/${uploaded.variants[0].id}`,
    );
    expect(uploaded.variants).toHaveLength(1);

    const listResponse = await app.request("/api/v1/assets", { headers: { cookie } });
    const detailResponse = await app.request(`/api/v1/assets/${uploaded.id}`, {
      headers: { cookie },
    });
    const originalResponse = await app.request(`/api/v1/assets/${uploaded.id}/content`, {
      headers: { cookie },
    });
    const thumbnailResponse = await app.request(
      `/api/v1/assets/${uploaded.id}/variants/${uploaded.variants[0].id}`,
      { headers: { cookie } },
    );

    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).assets).toHaveLength(1);
    expect(detailResponse.status).toBe(200);
    expect((await detailResponse.json()).id).toBe(uploaded.id);
    expect(originalResponse.status).toBe(200);
    expect(originalResponse.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await originalResponse.arrayBuffer())).toEqual(image);
    expect(thumbnailResponse.status).toBe(200);
    expect(thumbnailResponse.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await thumbnailResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("rejects invalid uploads with documented errors", async () => {
    const app = await createTestAppWithStorage();
    const cookie = await registerAccount(app, {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    const response = await uploadImage(
      app,
      cookie,
      new File([Buffer.from("not an image")], "notes.txt", { type: "text/plain" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "invalid_image",
      },
    });
  });

  it("keeps asset library routes scoped to the authenticated account", async () => {
    const app = await createTestAppWithStorage();
    const firstCookie = await registerAccount(app, {
      displayName: "First",
      email: "first@example.com",
    });
    const secondCookie = await registerAccount(app, {
      displayName: "Second",
      email: "second@example.com",
    });
    const image = await createPng();
    const uploadResponse = await uploadImage(
      app,
      firstCookie,
      new File([toArrayBuffer(image)], "first.png", { type: "image/png" }),
    );
    const uploaded = await uploadResponse.json();

    const secondListResponse = await app.request("/api/v1/assets", {
      headers: { cookie: secondCookie },
    });
    const secondDetailResponse = await app.request(`/api/v1/assets/${uploaded.id}`, {
      headers: { cookie: secondCookie },
    });
    const secondContentResponse = await app.request(`/api/v1/assets/${uploaded.id}/content`, {
      headers: { cookie: secondCookie },
    });

    expect(secondListResponse.status).toBe(200);
    expect((await secondListResponse.json()).assets).toEqual([]);
    expect(secondDetailResponse.status).toBe(404);
    expect(secondContentResponse.status).toBe(404);
  });

  it("creates, updates, duplicates, deletes, and reopens page documents", async () => {
    const app = createTestApp();
    const cookie = await registerAccount(app, {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    const document = createPageDocument({
      layers: [createTextLayer({ id: "text_1", text: "First page" })],
    });

    const createResponse = await postJson(
      app,
      "/api/v1/pages",
      {
        title: "Summer cover",
        document,
      },
      cookie,
    );

    expect(createResponse.status).toBe(201);

    const created = pageResponseSchema.parse(await createResponse.json());
    const patchedDocument = createPageDocument({
      canvas: { width: 1800, height: 1800, backgroundColor: "#ffffff" },
      layers: [createTextLayer({ id: "text_2", text: "Updated caption", x: 320 })],
    });
    const patchResponse = await app.request(`/api/v1/pages/${created.id}`, {
      body: JSON.stringify({ title: "Updated cover", document: patchedDocument }),
      headers: { cookie, "content-type": "application/json" },
      method: "PATCH",
    });
    const listResponse = await app.request("/api/v1/pages", { headers: { cookie } });
    const detailResponse = await app.request(`/api/v1/pages/${created.id}`, {
      headers: { cookie },
    });
    const duplicateResponse = await postJson(
      app,
      `/api/v1/pages/${created.id}/duplicate`,
      { title: "Updated cover copy" },
      cookie,
    );
    const deleteResponse = await app.request(`/api/v1/pages/${created.id}`, {
      headers: { cookie },
      method: "DELETE",
    });
    const deletedDetailResponse = await app.request(`/api/v1/pages/${created.id}`, {
      headers: { cookie },
    });

    expect(patchResponse.status).toBe(200);
    expect(pageResponseSchema.parse(await patchResponse.json())).toMatchObject({
      title: "Updated cover",
      width: 1800,
      height: 1800,
      document: {
        canvas: { backgroundColor: "#ffffff" },
        layers: [{ id: "text_2", text: "Updated caption" }],
      },
    });
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).pages).toHaveLength(1);
    expect(detailResponse.status).toBe(200);
    expect(pageResponseSchema.parse(await detailResponse.json()).document.layers[0]?.id).toBe(
      "text_2",
    );
    expect(duplicateResponse.status).toBe(201);
    expect(pageResponseSchema.parse(await duplicateResponse.json()).title).toBe(
      "Updated cover copy",
    );
    expect(deleteResponse.status).toBe(204);
    expect(deletedDetailResponse.status).toBe(404);
  });

  it("keeps page routes and photo layer references scoped to the authenticated account", async () => {
    const app = await createTestAppWithStorage();
    const firstCookie = await registerAccount(app, {
      displayName: "First",
      email: "first-pages@example.com",
    });
    const secondCookie = await registerAccount(app, {
      displayName: "Second",
      email: "second-pages@example.com",
    });
    const image = await createPng();
    const uploadResponse = await uploadImage(
      app,
      firstCookie,
      new File([toArrayBuffer(image)], "first.png", { type: "image/png" }),
    );
    const uploaded = await uploadResponse.json();
    const firstPageResponse = await postJson(
      app,
      "/api/v1/pages",
      {
        title: "First page",
        document: createPageDocument({
          layers: [createPhotoLayer({ id: "photo_1", assetId: uploaded.id })],
        }),
      },
      firstCookie,
    );
    const firstPage = pageResponseSchema.parse(await firstPageResponse.json());

    const secondListResponse = await app.request("/api/v1/pages", {
      headers: { cookie: secondCookie },
    });
    const secondDetailResponse = await app.request(`/api/v1/pages/${firstPage.id}`, {
      headers: { cookie: secondCookie },
    });
    const crossAccountAssetResponse = await postJson(
      app,
      "/api/v1/pages",
      {
        title: "Cross account page",
        document: createPageDocument({
          layers: [createPhotoLayer({ id: "photo_2", assetId: uploaded.id })],
        }),
      },
      secondCookie,
    );

    expect(secondListResponse.status).toBe(200);
    expect((await secondListResponse.json()).pages).toEqual([]);
    expect(secondDetailResponse.status).toBe(404);
    expect(crossAccountAssetResponse.status).toBe(400);
    expect(await crossAccountAssetResponse.json()).toMatchObject({
      error: { code: "page_asset_not_found" },
    });
  });

  it("creates books, orders pages into spreads, and rejects cross-account pages", async () => {
    const app = createTestApp();
    const firstCookie = await registerAccount(app, {
      displayName: "First",
      email: "first-books@example.com",
    });
    const secondCookie = await registerAccount(app, {
      displayName: "Second",
      email: "second-books@example.com",
    });
    const pageResponses = await Promise.all(
      ["Cover", "Left", "Right"].map((title) =>
        postJson(app, "/api/v1/pages", { title }, firstCookie),
      ),
    );
    const pages = await Promise.all(
      pageResponses.map(async (response) => pageResponseSchema.parse(await response.json())),
    );
    const secondPageResponse = await postJson(
      app,
      "/api/v1/pages",
      { title: "Other account" },
      secondCookie,
    );
    const secondPage = pageResponseSchema.parse(await secondPageResponse.json());
    const createBookResponse = await postJson(
      app,
      "/api/v1/books",
      { title: "Family book" },
      firstCookie,
    );

    expect(createBookResponse.status).toBe(201);

    const createdBook = bookResponseSchema.parse(await createBookResponse.json());
    const orderedResponse = await app.request(`/api/v1/books/${createdBook.id}/pages`, {
      body: JSON.stringify({ pageIds: pages.map((page) => page.id) }),
      headers: { cookie: firstCookie, "content-type": "application/json" },
      method: "PUT",
    });
    const orderedBook = bookResponseSchema.parse(await orderedResponse.json());
    const detailResponse = await app.request(`/api/v1/books/${createdBook.id}`, {
      headers: { cookie: firstCookie },
    });
    const secondDetailResponse = await app.request(`/api/v1/books/${createdBook.id}`, {
      headers: { cookie: secondCookie },
    });
    const crossAccountPageResponse = await app.request(`/api/v1/books/${createdBook.id}/pages`, {
      body: JSON.stringify({ pageIds: [pages[0]?.id, secondPage.id] }),
      headers: { cookie: firstCookie, "content-type": "application/json" },
      method: "PUT",
    });

    expect(orderedResponse.status).toBe(200);
    expect(orderedBook.pages.map((bookPage) => bookPage.page.title)).toEqual([
      "Cover",
      "Left",
      "Right",
    ]);
    expect(orderedBook.spreads).toMatchObject([
      { kind: "cover", rightPageId: pages[0]?.id },
      { kind: "facing", leftPageId: pages[1]?.id, rightPageId: pages[2]?.id },
    ]);
    expect(detailResponse.status).toBe(200);
    expect(bookResponseSchema.parse(await detailResponse.json()).pageCount).toBe(3);
    expect(secondDetailResponse.status).toBe(404);
    expect(crossAccountPageResponse.status).toBe(400);
  });

  it("creates page and book exports and streams completed output", async () => {
    const app = await createTestAppWithStorage();
    const firstCookie = await registerAccount(app, {
      displayName: "First",
      email: "first-exports@example.com",
    });
    const secondCookie = await registerAccount(app, {
      displayName: "Second",
      email: "second-exports@example.com",
    });
    const firstPageResponse = await postJson(
      app,
      "/api/v1/pages",
      {
        title: "Exportable page",
        document: createPageDocument({
          layers: [createTextLayer({ id: "export_text", text: "Ready to print" })],
        }),
      },
      firstCookie,
    );
    const secondPageResponse = await postJson(
      app,
      "/api/v1/pages",
      { title: "Private page" },
      secondCookie,
    );
    const page = pageResponseSchema.parse(await firstPageResponse.json());
    const secondPage = pageResponseSchema.parse(await secondPageResponse.json());
    const pageExportResponse = await postJson(
      app,
      "/api/v1/exports",
      { pageId: page.id, format: "png", preset: "digital" },
      firstCookie,
    );
    const pageExport = exportJobResponseSchema.parse(await pageExportResponse.json());
    const contentResponse = await app.request(`/api/v1/exports/${pageExport.id}/content`, {
      headers: { cookie: firstCookie },
    });
    const secondContentResponse = await app.request(`/api/v1/exports/${pageExport.id}/content`, {
      headers: { cookie: secondCookie },
    });
    const crossAccountExportResponse = await postJson(
      app,
      "/api/v1/exports",
      { pageId: secondPage.id, format: "png", preset: "digital" },
      firstCookie,
    );
    const bookResponse = await postJson(
      app,
      "/api/v1/books",
      { title: "Export book" },
      firstCookie,
    );
    const book = bookResponseSchema.parse(await bookResponse.json());

    await app.request(`/api/v1/books/${book.id}/pages`, {
      body: JSON.stringify({ pageIds: [page.id] }),
      headers: { cookie: firstCookie, "content-type": "application/json" },
      method: "PUT",
    });

    const bookExportResponse = await postJson(
      app,
      "/api/v1/exports",
      { bookId: book.id, format: "jpeg", preset: "print" },
      firstCookie,
    );
    const bookExport = exportJobResponseSchema.parse(await bookExportResponse.json());
    const pdfExportResponse = await postJson(
      app,
      "/api/v1/exports",
      { pageId: page.id, format: "pdf", preset: "print" },
      firstCookie,
    );
    const pdfExport = exportJobResponseSchema.parse(await pdfExportResponse.json());
    const pdfContentResponse = await app.request(`/api/v1/exports/${pdfExport.id}/content`, {
      headers: { cookie: firstCookie },
    });

    expect(pageExportResponse.status).toBe(201);
    expect(pageExport).toMatchObject({ status: "completed", targetKind: "page" });
    expect(pageExport.outputContentUrl).toBe(`/api/v1/exports/${pageExport.id}/content`);
    expect(contentResponse.status).toBe(200);
    expect(contentResponse.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await contentResponse.arrayBuffer()).byteLength).toBeGreaterThan(100);
    expect(secondContentResponse.status).toBe(404);
    expect(crossAccountExportResponse.status).toBe(404);
    expect(bookExportResponse.status).toBe(201);
    expect(bookExport).toMatchObject({ format: "jpeg", preset: "print", targetKind: "book" });
    expect(pdfExportResponse.status).toBe(201);
    expect(pdfExport).toMatchObject({ format: "pdf", preset: "print", targetKind: "page" });
    expect(pdfContentResponse.status).toBe(200);
    expect(pdfContentResponse.headers.get("content-type")).toBe("application/pdf");
    expect(
      Buffer.from(await pdfContentResponse.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  });

  it("persists non-destructive photo edits without mutating original assets", async () => {
    const app = await createTestAppWithStorage();
    const cookie = await registerAccount(app, {
      displayName: "Ada Lovelace",
      email: "ada-edits@example.com",
    });
    const image = await createPng();
    const uploadResponse = await uploadImage(
      app,
      cookie,
      new File([toArrayBuffer(image)], "editable.png", { type: "image/png" }),
    );
    const uploaded = await uploadResponse.json();
    const editedPhoto = createPhotoLayer({
      id: "photo_edit_1",
      assetId: uploaded.id,
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, aspectRatioPreset: "square" },
      photoTransform: {
        scale: 1.4,
        rotation: 12,
        flipX: true,
        flipY: false,
        offsetX: 0.15,
        offsetY: -0.1,
      },
      border: {
        width: 18,
        color: "#ffffff",
        radius: 28,
        style: "solid",
        framePreset: "mat",
      },
      mask: { shape: "diamond", inset: 0.02, feather: 4 },
      filter: { preset: "sepia", brightness: 1.05, contrast: 1.1, saturation: 0.8 },
      shadow: {
        enabled: true,
        color: "#202426",
        opacity: 0.22,
        offsetX: 0,
        offsetY: 20,
        blur: 36,
        spread: 0,
      },
    });
    const createResponse = await postJson(
      app,
      "/api/v1/pages",
      {
        title: "Edited photo",
        document: createPageDocument({ layers: [editedPhoto] }),
      },
      cookie,
    );
    const created = pageResponseSchema.parse(await createResponse.json());
    const detailResponse = await app.request(`/api/v1/pages/${created.id}`, {
      headers: { cookie },
    });
    const originalResponse = await app.request(`/api/v1/assets/${uploaded.id}/content`, {
      headers: { cookie },
    });
    const detail = pageResponseSchema.parse(await detailResponse.json());
    const layer = detail.document.layers[0];

    expect(createResponse.status).toBe(201);
    expect(detailResponse.status).toBe(200);
    expect(layer?.kind).toBe("photo");

    if (layer?.kind !== "photo") {
      throw new Error("Expected a photo layer");
    }

    expect(layer.assetId).toBe(uploaded.id);
    expect(layer.crop).toMatchObject({ aspectRatioPreset: "square", width: 0.8 });
    expect(layer.photoTransform).toMatchObject({ scale: 1.4, flipX: true });
    expect(layer.mask.shape).toBe("diamond");
    expect(originalResponse.status).toBe(200);
    expect(Buffer.from(await originalResponse.arrayBuffer())).toEqual(image);
  });
});
