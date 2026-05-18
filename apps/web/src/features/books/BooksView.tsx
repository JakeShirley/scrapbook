import { Button } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { apiClient } from "../../apiClient";
import { Panel, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { BookSummary } from "../../types";

export function BooksView() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    apiClient
      .listBooks()
      .then((bookResponse) => {
        if (isMounted) {
          setBooks(bookResponse.books);
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
  }, []);

  const createBook = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const book = await apiClient.createBook({ title: `Book ${books.length + 1}` });
      navigate(`/books/${book.id}`);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <WorkspaceHeader title="Books">
        <Button
          appearance="primary"
          className="primary-button"
          disabled={isCreating}
          icon={<AddRegular />}
          type="button"
          onClick={createBook}
        >
          New book
        </Button>
      </WorkspaceHeader>
      {error ? (
        <p className="panel-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="books-home-grid">
        <Panel title="Books" count={String(books.length)}>
          {isLoading ? <p className="empty-state">Loading books</p> : null}
          {!isLoading && books.length === 0 ? (
            <div className="books-empty-state">
              <p>No books yet.</p>
              <Button
                appearance="primary"
                type="button"
                className="primary-button"
                disabled={isCreating}
                icon={<AddRegular />}
                onClick={createBook}
              >
                Create your first book
              </Button>
            </div>
          ) : null}
          {books.length > 0 ? <BookList books={books} /> : null}
        </Panel>
      </div>
    </>
  );
}

function BookList({ books }: { books: BookSummary[] }) {
  const navigate = useNavigate();

  return (
    <ol className="book-card-list">
      {books.map((book) => (
        <li key={book.id}>
          <button type="button" onClick={() => navigate(`/books/${book.id}`)}>
            <span className="book-card-cover" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="book-card-copy">
              <span>{book.title}</span>
              <span>
                {book.pageCount} pages / {book.spreadCount} spreads
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
