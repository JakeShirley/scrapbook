import { healthResponseSchema } from "@scrapbook/api-contract";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";

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
});
