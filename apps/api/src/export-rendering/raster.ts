import type { ExportFormat, ExportPreset } from "@zakka/api-contract";
import sharp from "sharp";

import { checksumSha256 } from "./checksums.js";
import type { RenderedExport } from "./types.js";

export type RasterExportFormat = Exclude<ExportFormat, "pdf">;

export type RasterRenderSettings = {
  dpi?: number;
  preset: ExportPreset;
};

export type RenderedRasterImage = {
  buffer: Buffer;
  height: number;
  width: number;
};

const basePrintDpi = 300;

export const defaultDpiForPreset = (preset: ExportPreset): number =>
  preset === "print" ? basePrintDpi : 150;

export const resolveRasterDpi = (settings: RasterRenderSettings): number =>
  settings.dpi ?? defaultDpiForPreset(settings.preset);

export const renderScaleForDpi = (dpi: number): number => dpi / basePrintDpi;

export const renderScaleForPreset = (preset: ExportPreset): number =>
  renderScaleForDpi(defaultDpiForPreset(preset));

export const renderScaleForSettings = (settings: RasterRenderSettings): number =>
  renderScaleForDpi(resolveRasterDpi(settings));

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
  settings: RasterRenderSettings,
): Promise<RenderedRasterImage> => {
  const dpi = resolveRasterDpi(settings);
  const scale = renderScaleForSettings(settings);
  const image = sharp(Buffer.from(svg), {
    density: 72,
    limitInputPixels: false,
    unlimited: true,
  }).resize({
    width: Math.round(readSvgDimension(svg, "width") * scale),
    withoutEnlargement: false,
  });
  const rendered =
    format === "jpeg"
      ? await image
          .withMetadata({ density: dpi })
          .jpeg({ mozjpeg: true, quality: settings.preset === "print" ? 92 : 84 })
          .toBuffer({ resolveWithObject: true })
      : await image
          .withMetadata({ density: dpi })
          .png({ compressionLevel: 9 })
          .toBuffer({ resolveWithObject: true });

  return {
    buffer: rendered.data,
    height: rendered.info.height,
    width: rendered.info.width,
  };
};

export const rasterizeSvg = async (
  svg: string,
  format: RasterExportFormat,
  settings: RasterRenderSettings,
): Promise<RenderedExport> => {
  const output = outputForFormat(format);
  const image = await renderSvgRasterImage(svg, format, settings);

  return {
    buffer: image.buffer,
    byteSize: image.buffer.byteLength,
    checksumSha256: checksumSha256(image.buffer),
    extension: output.extension,
    mimeType: output.mimeType,
  };
};
