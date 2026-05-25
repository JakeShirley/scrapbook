import type { ExportPreset } from "@scrapbook/api-contract";
import {
  type PageDocument,
  type PhotoLayer,
  renderPageDocumentSvg,
  type WashiTapeLayer,
} from "@scrapbook/editor-core";
import { getStickerSvg } from "@scrapbook/editor-core/stickers";
import sharp from "sharp";

import { createSharpInputBuffer } from "../image-decoding.js";
import type { Repositories } from "../persistence/repositories.js";
import type { PageRecord } from "../persistence/schema.js";
import { type RasterRenderSettings, renderScaleForSettings } from "./raster.js";
import type { ExportStorage } from "./types.js";

const svgNativeImageMimeTypes = new Set(["image/jpeg", "image/png"]);
const maxOriginalDataUriByteSize = 2 * 1024 * 1024;

const targetPhotoDimension = (layer: PhotoLayer, settings: RasterRenderSettings): number => {
  const cropWidth = Math.max(layer.crop.width, 0.05);
  const cropHeight = Math.max(layer.crop.height, 0.05);
  const imageWidth = layer.width / cropWidth;
  const imageHeight = layer.height / cropHeight;
  const transformedDimension = Math.max(imageWidth, imageHeight) * layer.photoTransform.scale;

  return Math.max(1, Math.ceil(transformedDimension * renderScaleForSettings(settings)));
};

const targetWashiTapeDimension = (layer: WashiTapeLayer, settings: RasterRenderSettings): number =>
  Math.max(
    1,
    Math.ceil(
      Math.max(16, layer.height * layer.tile.scale) *
        Math.max(layer.tile.scaleX, layer.tile.scaleY) *
        renderScaleForSettings(settings),
    ),
  );

const createImageDataUri = async (input: {
  buffer: Buffer;
  mimeType: string;
  settings: RasterRenderSettings;
  targetDimension: number;
}): Promise<string> => {
  if (
    svgNativeImageMimeTypes.has(input.mimeType) &&
    input.buffer.byteLength <= maxOriginalDataUriByteSize
  ) {
    return `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
  }

  const sharpInputBuffer = await createSharpInputBuffer(input.buffer);
  const metadata = await sharp(sharpInputBuffer, {
    failOn: "warning",
    limitInputPixels: false,
  }).metadata();
  const image = sharp(sharpInputBuffer, { failOn: "warning", limitInputPixels: false })
    .rotate()
    .resize({
      fit: "inside",
      height: input.targetDimension,
      width: input.targetDimension,
      withoutEnlargement: true,
    });
  const rendered = metadata.hasAlpha
    ? {
        buffer: await image.png({ compressionLevel: 9 }).toBuffer(),
        mimeType: "image/png",
      }
    : {
        buffer: await image.jpeg({ mozjpeg: true, quality: 90 }).toBuffer(),
        mimeType: "image/jpeg",
      };

  return `data:${rendered.mimeType};base64,${rendered.buffer.toString("base64")}`;
};

export const parsePageDocument = async (page: PageRecord): Promise<PageDocument> => {
  const { pageDocumentSchema } = await import("@scrapbook/editor-core");

  return pageDocumentSchema.parse(JSON.parse(page.documentJson));
};

export const renderPageSvg = async (input: {
  accountId: string;
  document: PageDocument;
  dpi?: number;
  includeBackground?: boolean;
  preset: ExportPreset;
  repositories: Repositories;
  storage: ExportStorage;
}): Promise<string> => {
  const settings: RasterRenderSettings =
    input.dpi === undefined ? { preset: input.preset } : { dpi: input.dpi, preset: input.preset };
  const photoHrefs = new Map<string, string>();
  const washiTapeHrefs = new Map<string, string>();

  for (const layer of input.document.layers) {
    if (layer.kind === "photo") {
      const asset = input.repositories.assets.findByIdForAccount(input.accountId, layer.assetId);

      if (!asset) {
        continue;
      }

      const buffer = await input.storage.read(asset.originalStorageKey);
      photoHrefs.set(
        layer.id,
        await createImageDataUri({
          buffer,
          mimeType: asset.mimeType,
          settings,
          targetDimension: targetPhotoDimension(layer, settings),
        }),
      );

      continue;
    }

    if (layer.kind === "washiTape" && layer.pattern.kind === "customPhoto") {
      const assetId = layer.pattern.assetId ?? layer.assetId;

      if (!assetId) {
        continue;
      }

      const asset = input.repositories.assets.findByIdForAccount(input.accountId, assetId);

      if (!asset) {
        continue;
      }

      const buffer = await input.storage.read(asset.originalStorageKey);

      washiTapeHrefs.set(
        layer.id,
        await createImageDataUri({
          buffer,
          mimeType: asset.mimeType,
          settings,
          targetDimension: targetWashiTapeDimension(layer, settings),
        }),
      );
    }
  }

  return renderPageDocumentSvg(input.document, {
    ...(input.includeBackground === undefined
      ? {}
      : { includeBackground: input.includeBackground }),
    resolvePhotoHref: (layer: PhotoLayer) => photoHrefs.get(layer.id),
    resolveStickerSvg: (layer) => getStickerSvg(layer.stickerId),
    resolveWashiTapeHref: (layer: WashiTapeLayer) => washiTapeHrefs.get(layer.id),
  });
};
