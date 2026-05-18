import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { apiClient } from "../../apiClient";
import { Panel, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { BookDetail, BookSummary, ExportJob, PageSummary } from "../../types";

export function BooksView() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookDetail | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      apiClient.listBooks(),
      apiClient.listPages(),
      bookId ? apiClient.getBook(bookId) : null,
    ])
      .then(([bookResponse, pageResponse, book]) => {
        if (isMounted) {
          setBooks(bookResponse.books);
          setPages(pageResponse.pages);
          setSelectedBook(book);
          setTitleDraft(book?.title ?? "");
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [bookId]);

  const refreshBooks = async (nextBookId: string | undefined = bookId) => {
    const [bookResponse, pageResponse, book] = await Promise.all([
      apiClient.listBooks(),
      apiClient.listPages(),
      nextBookId ? apiClient.getBook(nextBookId) : null,
    ]);

    setBooks(bookResponse.books);
    setPages(pageResponse.pages);
    setSelectedBook(book);
    setTitleDraft(book?.title ?? "");
  };

  const createBook = async () => {
    setIsWorking(true);
    setError(null);

    try {
      const book = await apiClient.createBook({ title: `Book ${books.length + 1}` });
      await refreshBooks(book.id);
      navigate(`/books/${book.id}`);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError));
    } finally {
      setIsWorking(false);
    }
  };

  const renameBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedBook) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const book = await apiClient.updateBook(selectedBook.id, { title: titleDraft });
      setSelectedBook(book);
      await refreshBooks(book.id);
    } catch (renameError: unknown) {
      setError(getErrorMessage(renameError));
    } finally {
      setIsWorking(false);
    }
  };

  const setBookPageIds = async (pageIds: string[]) => {
    if (!selectedBook) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const book = await apiClient.setBookPages(selectedBook.id, { pageIds });
      setSelectedBook(book);
      await refreshBooks(book.id);
    } catch (pageError: unknown) {
      setError(getErrorMessage(pageError));
    } finally {
      setIsWorking(false);
    }
  };

  const addPageToBook = (pageId: string) => {
    if (!selectedBook || selectedBook.pages.some((bookPage) => bookPage.pageId === pageId)) {
      return;
    }

    void setBookPageIds([...selectedBook.pages.map((bookPage) => bookPage.pageId), pageId]);
  };

  const removePageFromBook = (pageId: string) => {
    if (!selectedBook) {
      return;
    }

    void setBookPageIds(
      selectedBook.pages
        .map((bookPage) => bookPage.pageId)
        .filter((currentPageId) => currentPageId !== pageId),
    );
  };

  const moveBookPage = (pageId: string, direction: -1 | 1) => {
    if (!selectedBook) {
      return;
    }

    const pageIds = selectedBook.pages.map((bookPage) => bookPage.pageId);
    const fromIndex = pageIds.indexOf(pageId);
    const toIndex = fromIndex + direction;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= pageIds.length) {
      return;
    }

    const [movedPageId] = pageIds.splice(fromIndex, 1);

    if (!movedPageId) {
      return;
    }

    pageIds.splice(toIndex, 0, movedPageId);
    void setBookPageIds(pageIds);
  };

  const exportBook = async (format: "pdf" | "png") => {
    if (!selectedBook || selectedBook.pages.length === 0) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      setExportJob(
        await apiClient.createExport({ bookId: selectedBook.id, format, preset: "print" }),
      );
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    } finally {
      setIsWorking(false);
    }
  };

  const availablePages = selectedBook
    ? pages.filter((page) => !selectedBook.pages.some((bookPage) => bookPage.pageId === page.id))
    : pages;

  return (
    <>
      <WorkspaceHeader title="Books">
        <button type="button" className="primary-button" disabled={isWorking} onClick={createBook}>
          New book
        </button>
      </WorkspaceHeader>
      {error ? (
        <p className="panel-alert" role="alert">
          {error}
        </p>
      ) : null}
      {exportJob?.outputContentUrl ? (
        <p className="download-banner">
          <a href={exportJob.outputContentUrl} target="_blank" rel="noreferrer">
            Download book {exportJob.format.toUpperCase()}
          </a>
        </p>
      ) : null}
      <div className="workspace-grid split-grid">
        <Panel title="Books" count={String(books.length)}>
          {isLoading ? <p className="empty-state">Loading books</p> : null}
          {!isLoading && books.length === 0 ? <p className="empty-state">No books yet</p> : null}
          {books.length > 0 ? <BookList books={books} selectedBookId={selectedBook?.id} /> : null}
        </Panel>
        {selectedBook ? (
          <section className="book-detail-stack" aria-label="Selected book">
            <Panel title="Book pages" count={String(selectedBook.pages.length)}>
              <form className="compact-form" onSubmit={renameBook}>
                <label>
                  <span>Title</span>
                  <input
                    maxLength={120}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.currentTarget.value)}
                  />
                </label>
                <button className="secondary-button" type="submit" disabled={isWorking}>
                  Rename
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isWorking || selectedBook.pages.length === 0}
                  onClick={() => exportBook("png")}
                >
                  Export PNG
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isWorking || selectedBook.pages.length === 0}
                  onClick={() => exportBook("pdf")}
                >
                  Export PDF
                </button>
              </form>
              {selectedBook.pages.length === 0 ? (
                <p className="empty-state">No pages in this book</p>
              ) : (
                <ol className="item-list book-page-list">
                  {selectedBook.pages.map((bookPage, index) => (
                    <li key={bookPage.id}>
                      <div className="book-page-row">
                        <button type="button" onClick={() => navigate(`/pages/${bookPage.pageId}`)}>
                          <span>{`Page ${index + 1}`}</span>
                          <span>{bookPage.page.title}</span>
                        </button>
                        <div className="book-page-actions">
                          <button
                            type="button"
                            disabled={index === 0 || isWorking}
                            onClick={() => moveBookPage(bookPage.pageId, -1)}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            disabled={index === selectedBook.pages.length - 1 || isWorking}
                            onClick={() => moveBookPage(bookPage.pageId, 1)}
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => removePageFromBook(bookPage.pageId)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel title="Add pages" count={String(availablePages.length)}>
              {availablePages.length === 0 ? (
                <p className="empty-state">No available pages</p>
              ) : (
                <ol className="item-list page-list">
                  {availablePages.map((page) => (
                    <li key={page.id}>
                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={() => addPageToBook(page.id)}
                      >
                        <span>{page.title}</span>
                        <span>{page.layerCount} layers</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel title="Spreads" count={String(selectedBook.spreads.length)}>
              {selectedBook.spreads.length === 0 ? (
                <p className="empty-state">No spreads yet</p>
              ) : (
                <ol className="spread-list">
                  {selectedBook.spreads.map((spread) => (
                    <li key={spread.spreadIndex}>
                      <div className="spread-preview-row" data-kind={spread.kind}>
                        {spread.pageIds.map((pageId) => (
                          <span key={pageId}>{pageTitleForBookPage(selectedBook, pageId)}</span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </section>
        ) : (
          <Panel title="Book pages" count="0">
            <p className="empty-state">Select a book to manage page order.</p>
          </Panel>
        )}
      </div>
    </>
  );
}

function BookList({
  books,
  selectedBookId,
}: {
  books: BookSummary[];
  selectedBookId: string | undefined;
}) {
  const navigate = useNavigate();

  return (
    <ol className="item-list page-list">
      {books.map((book) => (
        <li key={book.id}>
          <button
            type="button"
            aria-current={book.id === selectedBookId ? "page" : undefined}
            onClick={() => navigate(`/books/${book.id}`)}
          >
            <span>{book.title}</span>
            <span>
              {book.pageCount} pages / {book.spreadCount} spreads
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

const pageTitleForBookPage = (book: BookDetail, pageId: string): string =>
  book.pages.find((bookPage) => bookPage.pageId === pageId)?.page.title ?? "Missing page";
