import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { authSessionResponseSchema, healthResponseSchema } from "@scrapbook/api-contract";
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
});
