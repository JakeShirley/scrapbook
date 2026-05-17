import { describe, expect, it } from "vitest";

import { createTimestamp } from "./index.js";

describe("createTimestamp", () => {
  it("returns an ISO timestamp", () => {
    const timestamp = createTimestamp(new Date("2026-05-17T12:00:00.000Z"));

    expect(timestamp).toBe("2026-05-17T12:00:00.000Z");
  });
});
