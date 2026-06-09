import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import sharp from "sharp";

import type { AssetStorage } from "./assets.js";
import { decodeHeifImageToPng, isHeifImage } from "./image-decoding.js";
import type { Repositories } from "./persistence/repositories.js";
import type { CustomStickerRecord } from "./persistence/schema.js";

type JpxTile = {
  left: number;
  top: number;
  width: number;
  height: number;
  items: Uint8ClampedArray;
};

type JpxImageInstance = {
  parse: (data: Buffer) => void;
  width: number;
  height: number;
  componentsCount: number;
  tiles: JpxTile[];
};

type JpxModule = { JpxImage: new () => JpxImageInstance };

const jpegRequire = createRequire(import.meta.url);
const { JpxImage } = jpegRequire("jpeg2000") as JpxModule;

// JP2 ISO box file signature: 00 00 00 0C 6A 50 20 20 0D 0A 87 0A.
const jp2SignaturePrefix = Buffer.from([
  0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
]);

const isJp2Image = (buffer: Buffer): boolean =>
  buffer.byteLength >= jp2SignaturePrefix.byteLength &&
  buffer.subarray(0, jp2SignaturePrefix.byteLength).equals(jp2SignaturePrefix);

const decodeJp2ImageToPng = async (
  buffer: Buffer,
): Promise<{ buffer: Buffer; width: number; height: number }> => {
  const jpx = new JpxImage();
  jpx.parse(buffer);

  const width = jpx.width;
  const height = jpx.height;
  const channels = jpx.componentsCount;

  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new Error(`Unsupported JPEG 2000 component count: ${channels}`);
  }
  if (!width || !height) {
    throw new Error("JPEG 2000 image has invalid dimensions");
  }

  // jpx.tiles items are interleaved 8-bit samples per pixel per component, in
  // tile-local row-major order. Copy each tile into a single image buffer.
  const raw = Buffer.alloc(width * height * channels);
  for (const tile of jpx.tiles) {
    const rowStride = tile.width * channels;
    for (let row = 0; row < tile.height; row += 1) {
      const tileOffset = row * rowStride;
      const imageOffset = ((tile.top + row) * width + tile.left) * channels;
      raw.set(tile.items.subarray(tileOffset, tileOffset + rowStride), imageOffset);
    }
  }

  const png = await sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
  return { buffer: png, width, height };
};

type UploadFile = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name?: string;
  size?: number;
  type?: string;
};

const maxUploadByteSize = 5 * 1024 * 1024;

// HEIC/HEIF uploads are transcoded to PNG before storage so browsers can render the
// resulting sticker without a separate variant pipeline.
const heifMimeTypes = new Set(["image/heic", "image/heif"]);
// JP2/JPX uploads (Goodnotes uses them for attachments) follow the same
// transcode-to-PNG path so browsers can render them directly.
const jp2MimeTypes = new Set(["image/jp2", "image/jpx", "image/jpeg2000"]);

const supportedTypes: Record<string, { extension: string; canMeasure: boolean }> = {
  "image/png": { extension: ".png", canMeasure: true },
  "image/jpeg": { extension: ".jpg", canMeasure: true },
  "image/webp": { extension: ".webp", canMeasure: true },
  "image/gif": { extension: ".gif", canMeasure: true },
  "image/svg+xml": { extension: ".svg", canMeasure: false },
  "image/heic": { extension: ".png", canMeasure: true },
  "image/heif": { extension: ".png", canMeasure: true },
  "image/jp2": { extension: ".png", canMeasure: true },
  "image/jpx": { extension: ".png", canMeasure: true },
  "image/jpeg2000": { extension: ".png", canMeasure: true },
};

export class CustomStickerUploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 413 | 404 = 400,
  ) {
    super(message);
    this.name = "CustomStickerUploadError";
  }
}

const isUploadFile = (value: unknown): value is UploadFile =>
  typeof value === "object" &&
  value !== null &&
  "arrayBuffer" in value &&
  typeof (value as { arrayBuffer: unknown }).arrayBuffer === "function";

const checksumSha256 = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

const cleanFilename = (filename: string | undefined): string => {
  const basename = filename?.split(/[\\/]/).pop()?.trim();
  if (!basename) return "sticker";
  return basename.slice(0, 255);
};

const stripExtension = (filename: string): string => {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0) return filename;
  return filename.slice(0, dotIndex);
};

const readSvgDimensions = (buffer: Buffer): { width: number | null; height: number | null } => {
  const text = buffer.toString("utf8", 0, Math.min(buffer.byteLength, 4096));
  const viewBoxMatch = /viewBox\s*=\s*"([^"]+)"/i.exec(text);

  if (viewBoxMatch?.[1]) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);

    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      const width = Math.round(parts[2] as number);
      const height = Math.round(parts[3] as number);
      if (width > 0 && height > 0) return { width, height };
    }
  }

  const widthMatch = /\swidth\s*=\s*"([0-9.]+)/i.exec(text);
  const heightMatch = /\sheight\s*=\s*"([0-9.]+)/i.exec(text);

  if (widthMatch?.[1] && heightMatch?.[1]) {
    const width = Math.round(Number(widthMatch[1]));
    const height = Math.round(Number(heightMatch[1]));
    if (width > 0 && height > 0) return { width, height };
  }

  return { width: null, height: null };
};

const readImageDimensions = async (
  buffer: Buffer,
  mimeType: string,
): Promise<{ width: number | null; height: number | null }> => {
  if (mimeType === "image/svg+xml") {
    return readSvgDimensions(buffer);
  }

  try {
    const metadata = await sharp(buffer, { failOn: "warning" }).metadata();
    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    };
  } catch {
    return { width: null, height: null };
  }
};

export type CustomStickerUploadInput = {
  accountId: string;
  packId: string;
  file: unknown;
  name?: string;
  repositories: Repositories;
  storage: AssetStorage;
};

export const createCustomStickerFromUpload = async (
  input: CustomStickerUploadInput,
): Promise<CustomStickerRecord> => {
  if (!isUploadFile(input.file)) {
    throw new CustomStickerUploadError("missing_upload", "Upload must include an image file");
  }

  const declaredType = typeof input.file.type === "string" ? input.file.type.toLowerCase() : "";
  const mimeType = declaredType in supportedTypes ? declaredType : "";

  if (!mimeType) {
    throw new CustomStickerUploadError(
      "unsupported_sticker_type",
      "Sticker uploads must be PNG, JPEG, WebP, GIF, SVG, HEIC, HEIF, or JPEG 2000",
    );
  }

  if (typeof input.file.size === "number" && input.file.size > maxUploadByteSize) {
    throw new CustomStickerUploadError(
      "sticker_too_large",
      "Uploaded sticker must be 5 MB or smaller",
      413,
    );
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());

  if (buffer.byteLength === 0) {
    throw new CustomStickerUploadError("empty_upload", "Uploaded sticker cannot be empty");
  }

  if (buffer.byteLength > maxUploadByteSize) {
    throw new CustomStickerUploadError(
      "sticker_too_large",
      "Uploaded sticker must be 5 MB or smaller",
      413,
    );
  }

  const filename = cleanFilename(input.file.name);
  const formatSpec = supportedTypes[mimeType];

  if (!formatSpec) {
    throw new CustomStickerUploadError(
      "unsupported_sticker_type",
      "Sticker uploads must be PNG, JPEG, WebP, GIF, SVG, HEIC, HEIF, or JPEG 2000",
    );
  }

  let storedBuffer = buffer;
  let storedMimeType = mimeType;

  if (heifMimeTypes.has(mimeType) || isHeifImage(buffer)) {
    try {
      const decoded = await decodeHeifImageToPng(buffer);
      storedBuffer = Buffer.from(decoded);
    } catch {
      throw new CustomStickerUploadError(
        "invalid_sticker_image",
        "HEIC sticker could not be decoded",
      );
    }
    storedMimeType = "image/png";
  } else if (jp2MimeTypes.has(mimeType) || isJp2Image(buffer)) {
    try {
      const decoded = await decodeJp2ImageToPng(buffer);
      storedBuffer = Buffer.from(decoded.buffer);
    } catch {
      throw new CustomStickerUploadError(
        "invalid_sticker_image",
        "JPEG 2000 sticker could not be decoded",
      );
    }
    storedMimeType = "image/png";
  }

  const { width, height } = await readImageDimensions(storedBuffer, storedMimeType);
  const checksum = checksumSha256(storedBuffer);

  // Same bytes already in this pack: return the existing record instead of
  // writing the file or row a second time. Cross-pack duplicates are allowed.
  const existing = input.repositories.stickerPacks.findStickerInPackByChecksum(
    input.accountId,
    input.packId,
    checksum,
  );
  if (existing) {
    return existing;
  }

  const stored = await input.storage.write("stickers", storedBuffer, {
    extension: formatSpec.extension,
  });

  const trimmedName = input.name?.trim();
  const displayName =
    trimmedName && trimmedName.length > 0 ? trimmedName : stripExtension(filename);

  return input.repositories.stickerPacks.addStickerToPack({
    accountId: input.accountId,
    packId: input.packId,
    name: displayName,
    storageKey: stored.key,
    mimeType: storedMimeType,
    byteSize: stored.byteSize,
    width,
    height,
    checksumSha256: checksum,
  });
};
