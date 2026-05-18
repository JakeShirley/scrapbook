import { createHash } from "node:crypto";

import type { ExportFormat, ExportPreset } from "@scrapbook/api-contract";
import { type PageDocument, type PhotoLayer, renderPageDocumentSvg } from "@scrapbook/editor-core";
import sharp from "sharp";

import type { Repositories } from "./persistence/repositories.js";
import type { PageRecord } from "./persistence/schema.js";
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

type RasterExportFormat = Exclude<ExportFormat, "pdf">;

type RenderedRasterImage = {
  buffer: Buffer;
  height: number;
  width: number;
};

const outputForFormat = (format: RasterExportFormat) =>
  format === "jpeg"
    ? { extension: ".jpg", mimeType: "image/jpeg" }
    : { extension: ".png", mimeType: "image/png" };

const readSvgDimension = (svg: string, dimension: "height" | "width"): number => {
  const value = Number(svg.match(new RegExp(`${dimension}="([0-9.]+)"`))?.[1]);

  return Number.isFinite(value) && value > 0 ? value : 1;
};

const renderPageSvg = async (input: {
  accountId: string;
  document: PageDocument;
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

      photoHrefs.set(layer.id, `data:${asset.mimeType};base64,${buffer.toString("base64")}`);
    }
  }

  return renderPageDocumentSvg(input.document, {
    resolvePhotoHref: (layer: PhotoLayer) => photoHrefs.get(layer.id),
  });
};

const renderSvgRasterImage = async (
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

const rasterizeSvg = async (
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

const createPdfFromJpegImages = (images: RenderedRasterImage[]): Buffer => {
  const buffers: Buffer[] = [];
  const offsets = new Map<number, number>();
  let byteOffset = 0;
  const push = (part: string | Buffer) => {
    const buffer = typeof part === "string" ? Buffer.from(part, "binary") : part;

    buffers.push(buffer);
    byteOffset += buffer.byteLength;
  };
  const pushObject = (objectNumber: number, parts: Array<string | Buffer>) => {
    offsets.set(objectNumber, byteOffset);
    push(`${objectNumber} 0 obj\n`);
    for (const part of parts) push(part);
    push("\nendobj\n");
  };
  const objectCount = 2 + images.length * 3;
  const pageObjectNumber = (index: number): number => 3 + index * 3;
  const contentObjectNumber = (index: number): number => pageObjectNumber(index) + 1;
  const imageObjectNumber = (index: number): number => pageObjectNumber(index) + 2;
  const pageRefs = images.map((_, index) => `${pageObjectNumber(index)} 0 R`).join(" ");

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  pushObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  pushObject(2, [`<< /Type /Pages /Kids [${pageRefs}] /Count ${images.length} >>`]);

  for (const [index, image] of images.entries()) {
    const pageWidth = Math.max(1, Math.round(image.width));
    const pageHeight = Math.max(1, Math.round(image.height));
    const imageName = `Im${index + 1}`;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ`;

    pushObject(pageObjectNumber(index), [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageObjectNumber(index)} 0 R >> >> /Contents ${contentObjectNumber(index)} 0 R >>`,
    ]);
    pushObject(contentObjectNumber(index), [
      `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`,
    ]);
    pushObject(imageObjectNumber(index), [
      `<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.buffer.byteLength} >>\nstream\n`,
      image.buffer,
      "\nendstream",
    ]);
  }

  const xrefOffset = byteOffset;
  push(`xref\n0 ${objectCount + 1}\n`);
  push("0000000000 65535 f \n");
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    push(`${String(offsets.get(objectNumber) ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(buffers);
};

const renderSvgPdf = async (svgs: string[], preset: ExportPreset): Promise<RenderedExport> => {
  const images = await Promise.all(svgs.map((svg) => renderSvgRasterImage(svg, "jpeg", preset)));
  const buffer = createPdfFromJpegImages(images);

  return {
    buffer,
    byteSize: buffer.byteLength,
    checksumSha256: checksumSha256(buffer),
    extension: ".pdf",
    mimeType: "application/pdf",
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
    document,
    repositories: input.repositories,
    storage: input.storage,
  });

  return input.format === "pdf"
    ? renderSvgPdf([svg], input.preset)
    : rasterizeSvg(svg, input.format, input.preset);
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
        document: await parsePageDocument(page),
        repositories: input.repositories,
        storage: input.storage,
      }),
    })),
  );
  if (input.format === "pdf") {
    return renderSvgPdf(
      renderedPages.map(({ svg }) => svg),
      input.preset,
    );
  }

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
