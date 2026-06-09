import { describe, expect, it } from "vitest";

import { loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("loads safe local defaults", () => {
    const config = loadConfig({});

    expect(config.NODE_ENV).toBe("development");
    expect(config.API_PORT).toBe(4000);
    expect(config.SESSION_COOKIE_SECURE).toBeUndefined();
    expect(config.ZAKKA_DATA_DIR.replaceAll("\\", "/")).toMatch(/\/storage\/dev$/);
  });

  it("defaults production data to the container mount path", () => {
    const config = loadConfig({ NODE_ENV: "production" });

    expect(config.ZAKKA_DATA_DIR.replaceAll("\\", "/")).toMatch(/\/data\/zakka$/);
  });

  it("leaves session cookie security in auto mode for HTTPS web origins", () => {
    const config = loadConfig({ NODE_ENV: "production", WEB_ORIGIN: "https://zakka.test" });

    expect(config.SESSION_COOKIE_SECURE).toBeUndefined();
  });

  it("allows the secure session cookie setting to be overridden", () => {
    const secureConfig = loadConfig({
      SESSION_COOKIE_SECURE: "true",
      WEB_ORIGIN: "http://10.1.0.50:8222",
    });
    const localHttpConfig = loadConfig({
      NODE_ENV: "production",
      SESSION_COOKIE_SECURE: "false",
      WEB_ORIGIN: "https://zakka.test",
    });

    expect(secureConfig.SESSION_COOKIE_SECURE).toBe(true);
    expect(localHttpConfig.SESSION_COOKIE_SECURE).toBe(false);
  });

  it("rejects invalid ports", () => {
    expect(() => loadConfig({ API_PORT: "70000" })).toThrow();
  });

  it("rejects invalid secure session cookie settings", () => {
    expect(() => loadConfig({ SESSION_COOKIE_SECURE: "yes" })).toThrow();
  });
});
