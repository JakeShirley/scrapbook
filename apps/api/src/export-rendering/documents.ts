import type { ExportPreset } from "@scrapbook/api-contract";
import { type PageDocument, type PhotoLayer, renderPageDocumentSvg } from "@scrapbook/editor-core";
import sharp from "sharp";

import type { Repositories } from "../persistence/repositories.js";
import type { PageRecord } from "../persistence/schema.js";
import { renderScaleForPreset } from "./raster.js";
import type { ExportStorage } from "./types.js";

const svgNativeImageMimeTypes = new Set(["image/jpeg", "image/png"]);
const maxOriginalDataUriByteSize = 2 * 1024 * 1024;

const targetPhotoDimension = (layer: PhotoLayer, preset: ExportPreset): number => {
  const cropWidth = Math.max(layer.crop.width, 0.05);
  const cropHeight = Math.max(layer.crop.height, 0.05);
  const imageWidth = layer.width / cropWidth;
  const imageHeight = layer.height / cropHeight;
  const transformedDimension = Math.max(imageWidth, imageHeight) * layer.photoTransform.scale;

  return Math.max(1, Math.ceil(transformedDimension * renderScaleForPreset(preset)));
};

const createPhotoDataUri = async (input: {
  buffer: Buffer;
  layer: PhotoLayer;
  mimeType: string;
  preset: ExportPreset;
}): Promise<string> => {
  if (
    svgNativeImageMimeTypes.has(input.mimeType) &&
    input.buffer.byteLength <= maxOriginalDataUriByteSize
  ) {
    return `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
  }

  const metadata = await sharp(input.buffer, {
    failOn: "warning",
    limitInputPixels: false,
  }).metadata();
  const image = sharp(input.buffer, { failOn: "warning", limitInputPixels: false })
    .rotate()
    .resize({
      fit: "inside",
      height: targetPhotoDimension(input.layer, input.preset),
      width: targetPhotoDimension(input.layer, input.preset),
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
  preset: ExportPreset;
  repositories: Repositories;
  storage: ExportStorage;
}): Promise<string> => {
  const photoHrefs = new Map<string, string>();

  for (const layer of input.document.layers) {
    if (layer.kind === "photo") {
      const asset = input.repositories.assets.findByIdForAccount(input.accountId, layer.assetId);

      if (!asset) {
        continue;
      }

      const buffer = await input.storage.read(asset.originalStorageKey);

      photoHrefs.set(
        layer.id,
        await createPhotoDataUri({
          buffer,
          layer,
          mimeType: asset.mimeType,
          preset: input.preset,
        }),
      );
    }
  }

  return renderPageDocumentSvg(input.document, {
    resolvePhotoHref: (layer: PhotoLayer) => photoHrefs.get(layer.id),
  });
};
