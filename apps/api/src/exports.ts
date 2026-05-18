import type { ExportFormat, ExportPreset } from "@scrapbook/api-contract";

import { createBookSheetSvg } from "./export-rendering/book-sheet.js";
import { parsePageDocument, renderPageSvg } from "./export-rendering/documents.js";
import { renderSvgPdf } from "./export-rendering/pdf.js";
import { rasterizeSvg } from "./export-rendering/raster.js";
import {
  ExportRenderError,
  type ExportStorage,
  type RenderedExport,
} from "./export-rendering/types.js";
import type { Repositories } from "./persistence/repositories.js";
import type { PageRecord } from "./persistence/schema.js";

export { ExportRenderError, type ExportStorage, type RenderedExport };

type ExportRendererInput = {
  accountId: string;
  format: ExportFormat;
  preset: ExportPreset;
  repositories: Repositories;
  storage: ExportStorage;
};

const renderStoredPageSvg = async (input: ExportRendererInput & { page: PageRecord }) =>
  renderPageSvg({
    accountId: input.accountId,
    document: await parsePageDocument(input.page),
    repositories: input.repositories,
    storage: input.storage,
  });

export const renderPageExport = async (
  input: ExportRendererInput & {
    pageId: string;
  },
): Promise<RenderedExport> => {
  const page = input.repositories.pages.findByIdForAccount(input.accountId, input.pageId);

  if (!page) {
    throw new ExportRenderError("export_target_not_found", "Export target was not found", 404);
  }

  const svg = await renderStoredPageSvg({
    accountId: input.accountId,
    format: input.format,
    page,
    preset: input.preset,
    repositories: input.repositories,
    storage: input.storage,
  });

  return input.format === "pdf"
    ? renderSvgPdf([svg], input.preset)
    : rasterizeSvg(svg, input.format, input.preset);
};

export const renderBookExport = async (
  input: ExportRendererInput & {
    bookId: string;
  },
): Promise<RenderedExport> => {
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
      svg: await renderStoredPageSvg({
        accountId: input.accountId,
        format: input.format,
        page,
        preset: input.preset,
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

  const sheetSvg = createBookSheetSvg(renderedPages);

  return rasterizeSvg(sheetSvg, input.format, input.preset);
};
