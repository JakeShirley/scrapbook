import type { BookDetail, PageDetail } from "../../types";

export type ViewMode = "page" | "spread";

export type PngExportTarget = "book";

export type PageDropPosition = "before" | "after";

export type PageDropTarget = {
  pageId: string;
  position: PageDropPosition;
};

export type LoadedBook = {
  book: BookDetail;
  pages: PageDetail[];
};
