import { createHash } from "node:crypto";

import type { ExportFormat, ExportPreset } from "@scrapbook/api-contract";
import type { PageDocument, PageLayer, PhotoLayer } from "@scrapbook/editor-core";
import sharp from "sharp";

import type { Repositories } from "./persistence/repositories.js";
import type { AssetRecord, PageRecord } from "./persistence/schema.js";
import type { StorageArea, StoredObject } from "./storage/disk.js";

type WritableExportArea = Extract<StorageArea, "exports">;

export type ExportStorage = {
  write: (
    area: WritableExportArea,
    data: Buffer,
    options?: { extension?: string },
  ) => Promise<StoredObject>;
  read: (key: string) => Promise<Buffer>;
  remove: (key: string) => Promise<void>;
};

export type RenderedExport = {
  buffer: Buffer;
  byteSize: number;
  checksumSha256: string;
  extension: string;
  mimeType: string;
};

export class ExportRenderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 500 = 400,
  ) {
    super(message);
    this.name = "ExportRenderError";
  }
}

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const checksumSha256 = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

const renderScaleForPreset = (preset: ExportPreset): number => (preset === "print" ? 1 : 0.5);

const outputForFormat = (format: ExportFormat) =>
  format === "jpeg"
    ? { extension: ".jpg", mimeType: "image/jpeg" }
    : { extension: ".png", mimeType: "image/png" };

const layerTransform = (layer: PageLayer): string => {
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;

  return `rotate(${layer.rotation} ${centerX} ${centerY})`;
};

const renderTextLayer = (layer: Extract<PageLayer, { kind: "text" }>): string => {
  const lines = layer.text.split(/\r?\n/).slice(0, 20);
  const lineHeight = layer.fontSize * 1.2;
  const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const x =
    layer.align === "center"
      ? layer.x + layer.width / 2
      : layer.align === "right"
        ? layer.x + layer.width
        : layer.x;

  return `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}"><text x="${x}" y="${layer.y + layer.fontSize}" fill="${escapeXml(layer.color)}" font-family="${escapeXml(layer.fontFamily)}" font-size="${layer.fontSize}" text-anchor="${anchor}">${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("")}</text></g>`;
};

const photoClipPath = (layer: PhotoLayer, clipId: string): string => {
  switch (layer.mask.shape) {
    case "ellipse":
      return `<clipPath id="${clipId}"><ellipse cx="${layer.x + layer.width / 2}" cy="${layer.y + layer.height / 2}" rx="${(layer.width * (1 - layer.mask.inset)) / 2}" ry="${(layer.height * (1 - layer.mask.inset)) / 2}" /></clipPath>`;
    case "diamond":
      return `<clipPath id="${clipId}"><polygon points="${layer.x + layer.width / 2},${layer.y + layer.height * layer.mask.inset} ${layer.x + layer.width * (1 - layer.mask.inset)},${layer.y + layer.height / 2} ${layer.x + layer.width / 2},${layer.y + layer.height * (1 - layer.mask.inset)} ${layer.x + layer.width * layer.mask.inset},${layer.y + layer.height / 2}" /></clipPath>`;
    default:
      return `<clipPath id="${clipId}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.border.radius}" /></clipPath>`;
  }
};

const renderPhotoLayer = async (input: {
  accountId: string;
  asset: AssetRecord;
  layer: PhotoLayer;
  storage: ExportStorage;
  index: number;
}): Promise<{ defs: string; body: string }> => {
  const buffer = await input.storage.read(input.asset.originalStorageKey);
  const href = `data:${input.asset.mimeType};base64,${buffer.toString("base64")}`;
  const layer = input.layer;
  const clipId = `photo_clip_${input.index}`;
  const frameInset = layer.border.width / 2;
  const imageWidth = layer.width / Math.max(layer.crop.width, 0.05);
  const imageHeight = layer.height / Math.max(layer.crop.height, 0.05);
  const imageX = layer.x - layer.crop.x * imageWidth + layer.photoTransform.offsetX * layer.width;
  const imageY = layer.y - layer.crop.y * imageHeight + layer.photoTransform.offsetY * layer.height;
  const imageCenterX = layer.x + layer.width / 2;
  const imageCenterY = layer.y + layer.height / 2;
  const scaleX = layer.photoTransform.flipX
    ? -layer.photoTransform.scale
    : layer.photoTransform.scale;
  const scaleY = layer.photoTransform.flipY
    ? -layer.photoTransform.scale
    : layer.photoTransform.scale;

  return {
    defs: photoClipPath(layer, clipId),
    body: `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.border.radius}" fill="${escapeXml(layer.border.color)}" opacity="${layer.border.width > 0 ? 1 : 0}" /><image href="${href}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid ${layer.fit === "cover" ? "slice" : "meet"}" clip-path="url(#${clipId})" transform="translate(${imageCenterX} ${imageCenterY}) rotate(${layer.photoTransform.rotation}) scale(${scaleX} ${scaleY}) translate(${-imageCenterX} ${-imageCenterY})" /><rect x="${layer.x + frameInset}" y="${layer.y + frameInset}" width="${Math.max(0, layer.width - layer.border.width)}" height="${Math.max(0, layer.height - layer.border.width)}" rx="${layer.border.radius}" fill="none" stroke="${escapeXml(layer.border.color)}" stroke-width="${layer.border.width}" stroke-dasharray="${layer.border.style === "dashed" ? "24 18" : layer.border.style === "dotted" ? "4 14" : ""}" /></g>`,
  };
};

const renderEmbellishmentLayer = (layer: Extract<PageLayer, { kind: "embellishment" }>): string =>
  `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="24" fill="${escapeXml(layer.color)}" stroke="${escapeXml(layer.accentColor)}" stroke-width="12" /><text x="${layer.x + layer.width / 2}" y="${layer.y + layer.height / 2}" dominant-baseline="middle" text-anchor="middle" fill="#202426" font-family="Inter, sans-serif" font-size="${Math.max(24, Math.min(96, layer.height / 3))}" font-weight="700">${escapeXml(layer.label || layer.name)}</text></g>`;

const renderPageSvg = async (input: {
  accountId: string;
  page: PageRecord;
  document: PageDocument;
  repositories: Repositories;
  storage: ExportStorage;
}): Promise<string> => {
  const defs: string[] = [];
  const bodies: string[] = [];

  for (const [index, layer] of input.document.layers.entries()) {
    if (layer.kind === "photo") {
      const asset = input.repositories.assets.findByIdForAccount(input.accountId, layer.assetId);

      if (!asset) {
        continue;
      }

      const rendered = await renderPhotoLayer({
        accountId: input.accountId,
        asset,
        layer,
        storage: input.storage,
        index,
      });

      defs.push(rendered.defs);
      bodies.push(rendered.body);
      continue;
    }

    bodies.push(layer.kind === "text" ? renderTextLayer(layer) : renderEmbellishmentLayer(layer));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${input.document.canvas.width}" height="${input.document.canvas.height}" viewBox="0 0 ${input.document.canvas.width} ${input.document.canvas.height}"><defs>${defs.join("")}</defs><rect width="100%" height="100%" fill="${escapeXml(input.document.canvas.backgroundColor)}" />${bodies.join("")}</svg>`;
};

const rasterizeSvg = async (
  svg: string,
  format: ExportFormat,
  preset: ExportPreset,
): Promise<RenderedExport> => {
  const output = outputForFormat(format);
  const scale = renderScaleForPreset(preset);
  const image = sharp(Buffer.from(svg), { density: 72, limitInputPixels: false }).resize({
    width: Math.round(Number(svg.match(/width="(\d+)"/)?.[1] ?? 1) * scale),
    withoutEnlargement: false,
  });
  const buffer =
    format === "jpeg"
      ? await image.jpeg({ mozjpeg: true, quality: preset === "print" ? 92 : 84 }).toBuffer()
      : await image.png({ compressionLevel: 9 }).toBuffer();

  return {
    buffer,
    byteSize: buffer.byteLength,
    checksumSha256: checksumSha256(buffer),
    extension: output.extension,
    mimeType: output.mimeType,
  };
};

const parsePageDocument = async (page: PageRecord): Promise<PageDocument> => {
  const { pageDocumentSchema } = await import("@scrapbook/editor-core");

  return pageDocumentSchema.parse(JSON.parse(page.documentJson));
};

export const renderPageExport = async (input: {
  accountId: string;
  pageId: string;
  format: ExportFormat;
  preset: ExportPreset;
  repositories: Repositories;
  storage: ExportStorage;
}): Promise<RenderedExport> => {
  const page = input.repositories.pages.findByIdForAccount(input.accountId, input.pageId);

  if (!page) {
    throw new ExportRenderError("export_target_not_found", "Export target was not found", 404);
  }

  const document = await parsePageDocument(page);
  const svg = await renderPageSvg({
    accountId: input.accountId,
    page,
    document,
    repositories: input.repositories,
    storage: input.storage,
  });

  return rasterizeSvg(svg, input.format, input.preset);
};

export const renderBookExport = async (input: {
  accountId: string;
  bookId: string;
  format: ExportFormat;
  preset: ExportPreset;
  repositories: Repositories;
  storage: ExportStorage;
}): Promise<RenderedExport> => {
  const book = input.repositories.books.findByIdForAccount(input.accountId, input.bookId);

  if (!book) {
    throw new ExportRenderError("export_target_not_found", "Export target was not found", 404);
  }

  const bookPages = input.repositories.books.listPagesForBook(input.accountId, book.id);

  if (bookPages.length === 0) {
    throw new ExportRenderError("empty_book", "Book exports require at least one page");
  }

  const renderedPages = await Promise.all(
    bookPages.map(async ({ page }) => ({
      page,
      svg: await renderPageSvg({
        accountId: input.accountId,
        page,
        document: await parsePageDocument(page),
        repositories: input.repositories,
        storage: input.storage,
      }),
    })),
  );
  const pageWidth = Math.max(...renderedPages.map(({ page }) => page.width));
  const pageHeight = Math.max(...renderedPages.map(({ page }) => page.height));
  const gutter = Math.round(pageWidth * 0.04);
  const labelHeight = 96;
  const sheetWidth = pageWidth * 2 + gutter * 3;
  const rowHeight = pageHeight + labelHeight + gutter;
  const sheetHeight = renderedPages.length * rowHeight + gutter;
  const body = renderedPages
    .map(({ page, svg }, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = gutter + column * (pageWidth + gutter);
      const y = gutter + row * rowHeight + labelHeight;
      const encodedSvg = Buffer.from(svg).toString("base64");

      return `<text x="${x}" y="${y - 26}" fill="#202426" font-family="Inter, sans-serif" font-size="42" font-weight="700">${escapeXml(`${index + 1}. ${page.title}`)}</text><image href="data:image/svg+xml;base64,${encodedSvg}" x="${x}" y="${y}" width="${pageWidth}" height="${pageHeight}" preserveAspectRatio="xMidYMid meet" />`;
    })
    .join("");
  const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}"><rect width="100%" height="100%" fill="#f5f3ee" />${body}</svg>`;

  return rasterizeSvg(sheetSvg, input.format, input.preset);
};
