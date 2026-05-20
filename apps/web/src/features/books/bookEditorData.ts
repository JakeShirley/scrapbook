import { apiClient } from "../../apiClient";
import type { LoadedBook } from "./bookEditorTypes";

export const fetchBookWithPages = async (bookId: string): Promise<LoadedBook> => {
  const book = await apiClient.getBook(bookId);
  const pages = await Promise.all(book.pages.map((bookPage) => apiClient.getPage(bookPage.pageId)));

  return { book, pages };
};
