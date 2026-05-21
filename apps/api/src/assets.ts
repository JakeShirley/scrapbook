import { createHash } from "node:crypto";

import sharp from "sharp";

import { createSharpInputBuffer, isHeicImage } from "./image-decoding.js";
import type { Repositories } from "./persistence/repositories.js";
import type { AssetRecord, AssetVariantRecord } from "./persistence/schema.js";
import type { StorageArea, StoredObject } from "./storage/disk.js";

type WritableAssetArea = Extract<StorageArea, "exports" | "uploads" | "variants">;

export type AssetStorage = {
  write: (
    area: WritableAssetArea,
    data: Buffer,
    options?: { extension?: string },
  ) => Promise<StoredObject>;
  read: (key: string) => Promise<Buffer>;
  remove: (key: string) => Promise<void>;
};

type UploadFile = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name?: string;
  size?: number;
};

type SupportedImageFormat = "heic" | "jpeg" | "png" | "webp";

const maxUploadByteSize = 20 * 1024 * 1024;
const maxImageDimension = 20_000;
const thumbnailMaxDimension = 360;

const supportedImageTypes: Record<SupportedImageFormat, { mimeType: string; extension: string }> = {
  heic: { mimeType: "image/heic", extension: ".heic" },
  jpeg: { mimeType: "image/jpeg", extension: ".jpg" },
  png: { mimeType: "image/png", extension: ".png" },
  webp: { mimeType: "image/webp", extension: ".webp" },
};

export class AssetUploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 413 = 400,
  ) {
    super(message);
    this.name = "AssetUploadError";
  }
}

const isUploadFile = (value: unknown): value is UploadFile =>
  typeof value === "object" &&
  value !== null &&
  "arrayBuffer" in value &&
  typeof value.arrayBuffer === "function";

const checksumSha256 = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

const cleanFilename = (filename: string | undefined, extension: string): string => {
  const basename = filename?.split(/[\\/]/).pop()?.trim();

  if (!basename) {
    return `upload${extension}`;
  }

  return basename.slice(0, 255);
};

const readUploadBuffer = async (file: unknown): Promise<Buffer> => {
  if (Array.isArray(file) || !isUploadFile(file)) {
    throw new AssetUploadError("missing_upload", "Upload must include an image file");
  }

  if (typeof file.size === "number" && file.size > maxUploadByteSize) {
    throw new AssetUploadError("image_too_large", "Uploaded image must be 20 MB or smaller", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.byteLength === 0) {
    throw new AssetUploadError("empty_upload", "Uploaded image cannot be empty");
  }

  if (buffer.byteLength > maxUploadByteSize) {
    throw new AssetUploadError("image_too_large", "Uploaded image must be 20 MB or smaller", 413);
  }

  return buffer;
};

const readImageMetadata = async (buffer: Buffer) => {
  const isHeic = isHeicImage(buffer);
  let sharpInputBuffer: Buffer;

  try {
    sharpInputBuffer = isHeic ? await createSharpInputBuffer(buffer) : buffer;
  } catch {
    throw new AssetUploadError("invalid_image", "Uploaded file is not a valid image");
  }

  let metadata: sharp.Metadata;

  try {
    metadata = await sharp(sharpInputBuffer, { failOn: "warning" }).metadata();
  } catch {
    throw new AssetUploadError("invalid_image", "Uploaded file is not a valid image");
  }

  const format = metadata.format as Exclude<SupportedImageFormat, "heic"> | "heif" | undefined;
  const imageType = isHeic
    ? supportedImageTypes.heic
    : format && format !== "heif"
      ? supportedImageTypes[format]
      : undefined;

  if (!imageType) {
    throw new AssetUploadError(
      "unsupported_image_type",
      "Uploaded image must be JPEG, PNG, WebP, or HEIC",
    );
  }

  if (!metadata.width || !metadata.height) {
    throw new AssetUploadError(
      "invalid_image_dimensions",
      "Uploaded image dimensions could not be read",
    );
  }

  if (metadata.width > maxImageDimension || metadata.height > maxImageDimension) {
    throw new AssetUploadError(
      "image_dimensions_too_large",
      "Uploaded image dimensions are too large",
    );
  }

  return {
    extension: imageType.extension,
    height: metadata.height,
    mimeType: imageType.mimeType,
    sharpInputBuffer,
    width: metadata.width,
  };
};

const createThumbnail = async (buffer: Buffer) => {
  const result = await sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize({
      fit: "inside",
      height: thumbnailMaxDimension,
      withoutEnlargement: true,
      width: thumbnailMaxDimension,
    })
    .jpeg({ mozjpeg: true, quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    byteSize: result.data.byteLength,
    checksumSha256: checksumSha256(result.data),
    height: result.info.height,
    mimeType: "image/jpeg",
    width: result.info.width,
  };
};

export const createAssetFromUpload = async (input: {
  accountId: string;
  file: unknown;
  repositories: Repositories;
  storage: AssetStorage;
}): Promise<{ asset: AssetRecord; variants: AssetVariantRecord[] }> => {
  const buffer = await readUploadBuffer(input.file);
  const metadata = await readImageMetadata(buffer);
  const thumbnail = await createThumbnail(metadata.sharpInputBuffer);
  const originalStored = await input.storage.write("uploads", buffer, {
    extension: metadata.extension,
  });
  const thumbnailStored = await input.storage.write("variants", thumbnail.buffer, {
    extension: ".jpg",
  });

  try {
    const asset = input.repositories.assets.createOriginal({
      accountId: input.accountId,
      byteSize: originalStored.byteSize,
      checksumSha256: checksumSha256(buffer),
      height: metadata.height,
      mimeType: metadata.mimeType,
      originalFilename: cleanFilename(
        isUploadFile(input.file) ? input.file.name : undefined,
        metadata.extension,
      ),
      originalStorageKey: originalStored.key,
      width: metadata.width,
    });
    const variant = input.repositories.assets.createVariant({
      accountId: input.accountId,
      assetId: asset.id,
      byteSize: thumbnailStored.byteSize,
      checksumSha256: thumbnail.checksumSha256,
      height: thumbnail.height,
      kind: "thumbnail",
      mimeType: thumbnail.mimeType,
      storageKey: thumbnailStored.key,
      width: thumbnail.width,
    });

    return { asset, variants: [variant] };
  } catch (error) {
    await Promise.allSettled([
      input.storage.remove(originalStored.key),
      input.storage.remove(thumbnailStored.key),
    ]);
    throw error;
  }
};
