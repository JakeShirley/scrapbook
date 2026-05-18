import type { ExportFormat, ExportPreset } from "@scrapbook/api-contract";
import sharp from "sharp";

import { checksumSha256 } from "./checksums.js";
import type { RenderedExport } from "./types.js";

export type RasterExportFormat = Exclude<ExportFormat, "pdf">;

export type RenderedRasterImage = {
  buffer: Buffer;
  height: number;
  width: number;
};

const renderScaleForPreset = (preset: ExportPreset): number => (preset === "print" ? 1 : 0.5);

const outputForFormat = (format: RasterExportFormat) =>
  format === "jpeg"
    ? { extension: ".jpg", mimeType: "image/jpeg" }
    : { extension: ".png", mimeType: "image/png" };

const readSvgDimension = (svg: string, dimension: "height" | "width"): number => {
  const value = Number(svg.match(new RegExp(`${dimension}="([0-9.]+)"`))?.[1]);

  return Number.isFinite(value) && value > 0 ? value : 1;
};

export const renderSvgRasterImage = async (
  svg: string,
  format: RasterExportFormat,
  preset: ExportPreset,
): Promise<RenderedRasterImage> => {
  const scale = renderScaleForPreset(preset);
  const image = sharp(Buffer.from(svg), { density: 72, limitInputPixels: false }).resize({
    width: Math.round(readSvgDimension(svg, "width") * scale),
    withoutEnlargement: false,
  });
  const rendered =
    format === "jpeg"
      ? await image
          .jpeg({ mozjpeg: true, quality: preset === "print" ? 92 : 84 })
          .toBuffer({ resolveWithObject: true })
      : await image.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });

  return {
    buffer: rendered.data,
    height: rendered.info.height,
    width: rendered.info.width,
  };
};

export const rasterizeSvg = async (
  svg: string,
  format: RasterExportFormat,
  preset: ExportPreset,
): Promise<RenderedExport> => {
  const output = outputForFormat(format);
  const image = await renderSvgRasterImage(svg, format, preset);

  return {
    buffer: image.buffer,
    byteSize: image.buffer.byteLength,
    checksumSha256: checksumSha256(image.buffer),
    extension: output.extension,
    mimeType: output.mimeType,
  };
};
