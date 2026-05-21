import { describe, expect, it } from "vitest";

import {
  getStickerDefinition,
  getStickerSvg,
  renderStickerAssetSvg,
  searchStickers,
  stickerCatalog,
  stickerLibraryCounts,
} from "./stickers.js";

describe("package-backed stickers", () => {
  it("loads full sticker libraries from dependencies", () => {
    expect(stickerLibraryCounts.noto).toBeGreaterThan(3000);
    expect(stickerLibraryCounts.twemoji).toBeGreaterThan(3000);
    expect(stickerCatalog.length).toBe(stickerLibraryCounts.noto + stickerLibraryCounts.twemoji);
  });

  it("searches and renders stickers by package-qualified id", () => {
    const results = searchStickers({ limit: 10, query: "rainbow" });
    const sticker = getStickerDefinition("noto:rainbow");
    const stickerSvg = getStickerSvg("noto:rainbow");

    expect(results.total).toBeGreaterThan(0);
    expect(results.stickers.some((result) => result.id === "noto:rainbow")).toBe(true);
    expect(sticker).toMatchObject({ id: "noto:rainbow", libraryName: "Noto Emoji" });
    expect(stickerSvg?.body).toContain("<");
    expect(renderStickerAssetSvg("noto:rainbow")).toContain("<svg");
  });
});
