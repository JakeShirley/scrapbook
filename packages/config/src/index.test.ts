import { describe, expect, it } from "vitest";

import { loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("loads safe local defaults", () => {
    const config = loadConfig({});

    expect(config.NODE_ENV).toBe("development");
    expect(config.API_PORT).toBe(4000);
    expect(config.SCRAPBOOK_DATA_DIR.replaceAll("\\", "/")).toMatch(/\/storage\/dev$/);
  });

  it("defaults production data to the container mount path", () => {
    const config = loadConfig({ NODE_ENV: "production" });

    expect(config.SCRAPBOOK_DATA_DIR.replaceAll("\\", "/")).toMatch(/\/data\/scrapbook$/);
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ API_PORT: "70000" })).toThrow();
  });
});
