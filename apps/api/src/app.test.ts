import { authSessionResponseSchema, healthResponseSchema } from "@scrapbook/api-contract";
import { makeFixedClock } from "@scrapbook/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createDatabaseConnection, type DatabaseConnection } from "./persistence/database.js";
import { runMigrations } from "./persistence/migrations.js";
import { createRepositories } from "./persistence/repositories.js";

const connections: DatabaseConnection[] = [];

const createTestApp = () => {
  const connection = createDatabaseConnection({ databasePath: ":memory:" });
  connections.push(connection);
  runMigrations(connection.sqlite);

  return createApp({
    clock: makeFixedClock(new Date("2026-05-17T12:00:00.000Z")),
    repositories: createRepositories(connection.db, {
      clock: makeFixedClock(new Date("2026-05-17T12:00:00.000Z")),
    }),
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

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close();
  }
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
});
