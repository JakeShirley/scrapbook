import { createHash } from "node:crypto";

import sharp from "sharp";

import type { AssetStorage } from "./assets.js";
import type { Repositories } from "./persistence/repositories.js";
import type { CustomStickerRecord } from "./persistence/schema.js";

type UploadFile = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name?: string;
  size?: number;
  type?: string;
};

const maxUploadByteSize = 5 * 1024 * 1024;

const supportedTypes: Record<string, { extension: string; canMeasure: boolean }> = {
  "image/png": { extension: ".png", canMeasure: true },
  "image/jpeg": { extension: ".jpg", canMeasure: true },
  "image/webp": { extension: ".webp", canMeasure: true },
  "image/gif": { extension: ".gif", canMeasure: true },
  "image/svg+xml": { extension: ".svg", canMeasure: false },
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
      "Sticker uploads must be PNG, JPEG, WebP, GIF, or SVG",
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
      "Sticker uploads must be PNG, JPEG, WebP, GIF, or SVG",
    );
  }

  const { width, height } = await readImageDimensions(buffer, mimeType);

  const stored = await input.storage.write("stickers", buffer, { extension: formatSpec.extension });

  const trimmedName = input.name?.trim();
  const displayName =
    trimmedName && trimmedName.length > 0 ? trimmedName : stripExtension(filename);

  return input.repositories.stickerPacks.addStickerToPack({
    accountId: input.accountId,
    packId: input.packId,
    name: displayName,
    storageKey: stored.key,
    mimeType,
    byteSize: stored.byteSize,
    width,
    height,
    checksumSha256: checksumSha256(buffer),
  });
};
