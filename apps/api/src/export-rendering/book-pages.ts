import { checksumSha256 } from "./checksums.js";
import { type RasterRenderSettings, renderSvgRasterImage } from "./raster.js";
import type { RenderedExport } from "./types.js";
import { createStoredZip } from "./zip.js";

type RenderedBookPage = {
  page: {
    title: string;
  };
  svg: string;
};

const sanitizeFilenamePart = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized.slice(0, 64) : "untitled";
};

const pageImageFilename = (page: RenderedBookPage, index: number, pageCount: number): string => {
  const width = Math.max(3, String(pageCount).length);
  const pageNumber = String(index + 1).padStart(width, "0");

  return `${pageNumber}-${sanitizeFilenamePart(page.page.title)}.png`;
};

export const rasterizeBookPngZip = async (
  renderedPages: RenderedBookPage[],
  settings: RasterRenderSettings,
): Promise<RenderedExport> => {
  const pageImages = await Promise.all(
    renderedPages.map(async (page, index) => ({
      data: (await renderSvgRasterImage(page.svg, "png", settings)).buffer,
      name: pageImageFilename(page, index, renderedPages.length),
    })),
  );
  const buffer = createStoredZip(pageImages);

  return {
    buffer,
    byteSize: buffer.byteLength,
    checksumSha256: checksumSha256(buffer),
    extension: ".zip",
    mimeType: "application/zip",
  };
};
