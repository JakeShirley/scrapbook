import { describe, expect, it } from "vitest";

import { loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("loads safe local defaults", () => {
    const config = loadConfig({});

    expect(config.NODE_ENV).toBe("development");
    expect(config.API_PORT).toBe(4000);
    expect(config.SCRAPBOOK_DATA_DIR.endsWith("storage/dev")).toBe(true);
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ API_PORT: "70000" })).toThrow();
  });
});
