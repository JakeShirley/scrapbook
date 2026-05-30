import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderSvgRasterImage } from "./raster.js";

describe("SVG raster rendering", () => {
  it("renders internally generated SVGs with large data URI attributes", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" data-export-href="data:image/png;base64,${"A".repeat(10_010_000)}" fill="#e4482f"/></svg>`;

    const rendered = await renderSvgRasterImage(svg, "png", { preset: "digital" });
    const metadata = await sharp(rendered.buffer).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1);
    expect(metadata.height).toBe(1);
  });
});
