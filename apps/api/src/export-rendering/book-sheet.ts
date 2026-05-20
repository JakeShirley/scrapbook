import type { ExportPreset } from "@scrapbook/api-contract";
import sharp from "sharp";
import type { PageRecord } from "../persistence/schema.js";
import { checksumSha256 } from "./checksums.js";
import {
  type RasterExportFormat,
  type RenderedRasterImage,
  renderScaleForPreset,
  renderSvgRasterImage,
} from "./raster.js";
import type { RenderedExport } from "./types.js";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

type RenderedBookPage = {
  page: Pick<PageRecord, "height" | "title" | "width">;
  svg: string;
};

type BookSheetLayout = {
  gutter: number;
  labelHeight: number;
  pageHeight: number;
  pageWidth: number;
  rowHeight: number;
  sheetHeight: number;
  sheetWidth: number;
};

const createBookSheetLayout = (renderedPages: RenderedBookPage[]): BookSheetLayout => {
  const pageWidth = Math.max(...renderedPages.map(({ page }) => page.width));
  const pageHeight = Math.max(...renderedPages.map(({ page }) => page.height));
  const gutter = Math.round(pageWidth * 0.04);
  const labelHeight = 96;
  const sheetWidth = pageWidth * 2 + gutter * 3;
  const rowHeight = pageHeight + labelHeight + gutter;
  const sheetHeight = renderedPages.length * rowHeight + gutter;

  return { gutter, labelHeight, pageHeight, pageWidth, rowHeight, sheetHeight, sheetWidth };
};

const scaleDimension = (value: number, scale: number): number =>
  Math.max(1, Math.round(value * scale));

const outputForFormat = (format: RasterExportFormat) =>
  format === "jpeg"
    ? { extension: ".jpg", mimeType: "image/jpeg" }
    : { extension: ".png", mimeType: "image/png" };

const createBookSheetLabelSvg = (input: {
  layout: BookSheetLayout;
  renderedPages: RenderedBookPage[];
  scale: number;
}): Buffer => {
  const { layout, renderedPages, scale } = input;
  const sheetWidth = scaleDimension(layout.sheetWidth, scale);
  const sheetHeight = scaleDimension(layout.sheetHeight, scale);
  const labels = renderedPages
    .map(({ page }, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = scaleDimension(layout.gutter + column * (layout.pageWidth + layout.gutter), scale);
      const y = scaleDimension(
        layout.gutter + row * layout.rowHeight + layout.labelHeight - 26,
        scale,
      );

      return `<text x="${x}" y="${y}" fill="#202426" font-family="Inter, sans-serif" font-size="${42 * scale}" font-weight="700">${escapeXml(`${index + 1}. ${page.title}`)}</text>`;
    })
    .join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}">${labels}</svg>`,
  );
};

const pageCompositeInput = (input: {
  image: RenderedRasterImage;
  index: number;
  layout: BookSheetLayout;
  scale: number;
}): sharp.OverlayOptions => {
  const { image, index, layout, scale } = input;
  const column = index % 2;
  const row = Math.floor(index / 2);
  const pageBoxWidth = scaleDimension(layout.pageWidth, scale);
  const pageBoxHeight = scaleDimension(layout.pageHeight, scale);
  const x = scaleDimension(layout.gutter + column * (layout.pageWidth + layout.gutter), scale);
  const y = scaleDimension(layout.gutter + row * layout.rowHeight + layout.labelHeight, scale);

  return {
    input: image.buffer,
    left: x + Math.round(Math.max(0, pageBoxWidth - image.width) / 2),
    top: y + Math.round(Math.max(0, pageBoxHeight - image.height) / 2),
  };
};

export const rasterizeBookSheet = async (
  renderedPages: RenderedBookPage[],
  format: RasterExportFormat,
  preset: ExportPreset,
): Promise<RenderedExport> => {
  const output = outputForFormat(format);
  const scale = renderScaleForPreset(preset);
  const layout = createBookSheetLayout(renderedPages);
  const pageImages = await Promise.all(
    renderedPages.map(({ svg }) => renderSvgRasterImage(svg, "png", preset)),
  );
  const composites = pageImages.map((image, index) =>
    pageCompositeInput({ image, index, layout, scale }),
  );
  const sheet = sharp({
    create: {
      background: "#f5f3ee",
      channels: 4,
      height: scaleDimension(layout.sheetHeight, scale),
      width: scaleDimension(layout.sheetWidth, scale),
    },
  }).composite([
    { input: createBookSheetLabelSvg({ layout, renderedPages, scale }) },
    ...composites,
  ]);
  const buffer =
    format === "jpeg"
      ? await sheet
          .flatten({ background: "#f5f3ee" })
          .jpeg({ mozjpeg: true, quality: 92 })
          .toBuffer()
      : await sheet.png({ compressionLevel: 9 }).toBuffer();

  return {
    buffer,
    byteSize: buffer.byteLength,
    checksumSha256: checksumSha256(buffer),
    extension: output.extension,
    mimeType: output.mimeType,
  };
};
