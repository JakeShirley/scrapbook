import {
  addLayer,
  createEmbellishmentLayer,
  createPageDocument,
  createPhotoLayer,
  createTextLayer,
  type PageDocument,
  type PageLayer,
  updateCanvas,
  updateLayer,
} from "@scrapbook/editor-core";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { apiClient } from "../../apiClient";
import { WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { Asset, BookDetail, ExportJob, PageDetail } from "../../types";
import { AssetRail } from "../editor/AssetRail";
import { EditorToolbar } from "../editor/EditorToolbar";
import type { EditorSaveStatus } from "../editor/editorTypes";
import type { EmbellishmentPreset } from "../editor/embellishments";
import { LayerInspector } from "../editor/LayerInspector";
import { LayerList } from "../editor/LayerList";
import { PageCanvas } from "../editor/PageCanvas";

type ViewMode = "page" | "spread";

type LoadedBook = {
  book: BookDetail;
  pages: PageDetail[];
};

const fetchBookWithPages = async (bookId: string): Promise<LoadedBook> => {
  const book = await apiClient.getBook(bookId);
  const pages = await Promise.all(book.pages.map((bookPage) => apiClient.getPage(bookPage.pageId)));

  return { book, pages };
};

export function BookEditorView() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [bookTitleDraft, setBookTitleDraft] = useState("");
  const [pageDetails, setPageDetails] = useState<Map<string, PageDetail>>(new Map());
  const [pageStatuses, setPageStatuses] = useState<Record<string, EditorSaveStatus>>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("spread");
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyLoadedBook = useCallback((loadedBook: LoadedBook, preferredPageId: string | null) => {
    const detailsById = new Map(loadedBook.pages.map((page) => [page.id, page]));
    const orderedPageIds = loadedBook.book.pages.map((bookPage) => bookPage.pageId);
    const nextActivePageId =
      preferredPageId && orderedPageIds.includes(preferredPageId)
        ? preferredPageId
        : (orderedPageIds[0] ?? null);
    const nextActivePage = nextActivePageId ? detailsById.get(nextActivePageId) : null;

    setBook(loadedBook.book);
    setBookTitleDraft(loadedBook.book.title);
    setPageDetails(detailsById);
    setPageStatuses(Object.fromEntries(loadedBook.pages.map((page) => [page.id, "saved"])));
    setActivePageId(nextActivePageId);
    setSelectedLayerId(nextActivePage?.document.layers[0]?.id ?? null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!bookId) {
      navigate("/books", { replace: true });
      return () => {
        isMounted = false;
      };
    }

    const loadEditor = async () => {
      setIsLoading(true);
      const [loadedBook, assetResponse] = await Promise.all([
        fetchBookWithPages(bookId),
        apiClient.listAssets(),
      ]);

      if (!isMounted) {
        return;
      }

      applyLoadedBook(loadedBook, loadedBook.book.pages[0]?.pageId ?? null);
      setAssets(assetResponse.assets);
      setError(null);
      setIsLoading(false);
    };

    loadEditor().catch((loadError: unknown) => {
      if (isMounted) {
        setError(getErrorMessage(loadError));
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [applyLoadedBook, bookId, navigate]);

  const reloadBook = async (preferredPageId: string | null = activePageId) => {
    if (!bookId) {
      return;
    }

    applyLoadedBook(await fetchBookWithPages(bookId), preferredPageId);
  };

  const orderedPageIds = useMemo(
    () => book?.pages.map((bookPage) => bookPage.pageId) ?? [],
    [book],
  );
  const activePageIndex = activePageId ? orderedPageIds.indexOf(activePageId) : -1;
  const activePage = activePageId ? (pageDetails.get(activePageId) ?? null) : null;
  const activeStatus = activePageId ? (pageStatuses[activePageId] ?? "saved") : "saved";
  const activeSpreadIndex =
    book?.spreads.findIndex((spread) => activePageId && spread.pageIds.includes(activePageId)) ??
    -1;
  const activeSpread =
    activeSpreadIndex >= 0
      ? (book?.spreads[activeSpreadIndex] ?? null)
      : (book?.spreads[0] ?? null);
  const visiblePageIds =
    viewMode === "spread" ? (activeSpread?.pageIds ?? []) : activePageId ? [activePageId] : [];
  const canNavigatePrevious = viewMode === "spread" ? activeSpreadIndex > 0 : activePageIndex > 0;
  const canNavigateNext =
    viewMode === "spread"
      ? activeSpreadIndex >= 0 && activeSpreadIndex < (book?.spreads.length ?? 0) - 1
      : activePageIndex >= 0 && activePageIndex < orderedPageIds.length - 1;
  const navigationLabel =
    viewMode === "spread"
      ? `Spread ${Math.max(activeSpreadIndex + 1, 1)} of ${book?.spreads.length ?? 0}`
      : activePageIndex >= 0
        ? `Page ${activePageIndex + 1} of ${orderedPageIds.length}`
        : "No pages";
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedLayer = useMemo(
    () => activePage?.document.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [activePage, selectedLayerId],
  );

  const selectPage = (pageId: string, layerId?: string | null) => {
    const page = pageDetails.get(pageId);

    setActivePageId(pageId);
    setSelectedLayerId(layerId ?? page?.document.layers[0]?.id ?? null);
  };

  const updatePageDetail = (pageId: string, update: (page: PageDetail) => PageDetail) => {
    setPageDetails((currentDetails) => {
      const page = currentDetails.get(pageId);

      if (!page) {
        return currentDetails;
      }

      const nextDetails = new Map(currentDetails);
      nextDetails.set(pageId, update(page));

      return nextDetails;
    });
  };

  const setPageStatus = (pageId: string, status: EditorSaveStatus) => {
    setPageStatuses((currentStatuses) => ({ ...currentStatuses, [pageId]: status }));
  };

  const editPageDocument = (pageId: string, nextDocument: PageDocument) => {
    updatePageDetail(pageId, (page) => ({
      ...page,
      document: nextDocument,
      height: nextDocument.canvas.height,
      layerCount: nextDocument.layers.length,
      width: nextDocument.canvas.width,
    }));
    setPageStatus(pageId, "unsaved");
  };

  const updateActiveLayer = (update: Partial<PageLayer>) => {
    if (!activePage || !selectedLayerId) {
      return;
    }

    editPageDocument(activePage.id, updateLayer(activePage.document, selectedLayerId, update));
  };

  const updateLayerTransform = (pageId: string, layerId: string, update: Partial<PageLayer>) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    editPageDocument(pageId, updateLayer(page.document, layerId, update));
  };

  const addText = () => {
    if (!activePage) {
      return;
    }

    const layer = createTextLayer({ text: "New text", name: "Text" });
    editPageDocument(activePage.id, addLayer(activePage.document, layer));
    setSelectedLayerId(layer.id);
  };

  const addPhoto = (asset: Asset) => {
    if (!activePage) {
      return;
    }

    const layer = createPhotoLayer({
      assetId: asset.id,
      name: asset.originalFilename,
      width: Math.min(activePage.document.canvas.width * 0.5, 1000),
      height: Math.min(activePage.document.canvas.height * 0.34, 760),
    });

    editPageDocument(activePage.id, addLayer(activePage.document, layer));
    setSelectedLayerId(layer.id);
  };

  const addEmbellishment = (preset: EmbellishmentPreset) => {
    if (!activePage) {
      return;
    }

    const layer = createEmbellishmentLayer({
      ...preset,
      width: Math.min(activePage.document.canvas.width * 0.28, 620),
      height: Math.min(activePage.document.canvas.height * 0.12, 320),
      x: activePage.document.canvas.width * 0.12,
      y: activePage.document.canvas.height * 0.12,
    });

    editPageDocument(activePage.id, addLayer(activePage.document, layer));
    setSelectedLayerId(layer.id);
  };

  const renameBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!book) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const updatedBook = await apiClient.updateBook(book.id, { title: bookTitleDraft });
      setBook(updatedBook);
      setBookTitleDraft(updatedBook.title);
    } catch (renameError: unknown) {
      setError(getErrorMessage(renameError));
    } finally {
      setIsWorking(false);
    }
  };

  const saveActivePage = async () => {
    if (!activePage) {
      return;
    }

    setPageStatus(activePage.id, "saving");
    setError(null);

    try {
      const savedPage = await apiClient.updatePage(activePage.id, {
        document: activePage.document,
        title: activePage.title,
      });
      updatePageDetail(activePage.id, () => savedPage);
      setPageStatus(activePage.id, "saved");
    } catch (saveError: unknown) {
      setPageStatus(activePage.id, "error");
      setError(getErrorMessage(saveError));
    }
  };

  const addPage = async () => {
    if (!book) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const page = await apiClient.createPage({
        document: createPageDocument(),
        title: `Page ${book.pages.length + 1}`,
      });
      await apiClient.setBookPages(book.id, {
        pageIds: [...orderedPageIds, page.id],
      });
      await reloadBook(page.id);
    } catch (addError: unknown) {
      setError(getErrorMessage(addError));
    } finally {
      setIsWorking(false);
    }
  };

  const duplicateActivePage = async () => {
    if (!book || !activePage) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const duplicated = await apiClient.duplicatePage(activePage.id, {
        title: `${activePage.title} copy`,
      });
      const nextPageIds = [...orderedPageIds];
      nextPageIds.splice(activePageIndex + 1, 0, duplicated.id);
      await apiClient.setBookPages(book.id, { pageIds: nextPageIds });
      await reloadBook(duplicated.id);
    } catch (duplicateError: unknown) {
      setError(getErrorMessage(duplicateError));
    } finally {
      setIsWorking(false);
    }
  };

  const deleteActivePage = async () => {
    if (!book || !activePage) {
      return;
    }

    const nextPageIds = orderedPageIds.filter((pageId) => pageId !== activePage.id);
    const nextActivePageId =
      nextPageIds[activePageIndex] ?? nextPageIds[activePageIndex - 1] ?? null;

    setIsWorking(true);
    setError(null);

    try {
      await apiClient.setBookPages(book.id, { pageIds: nextPageIds });
      await apiClient.deletePage(activePage.id);
      await reloadBook(nextActivePageId);
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsWorking(false);
    }
  };

  const moveActivePage = async (direction: -1 | 1) => {
    if (!book || !activePageId) {
      return;
    }

    const toIndex = activePageIndex + direction;

    if (activePageIndex < 0 || toIndex < 0 || toIndex >= orderedPageIds.length) {
      return;
    }

    const nextPageIds = [...orderedPageIds];
    const [movedPageId] = nextPageIds.splice(activePageIndex, 1);

    if (!movedPageId) {
      return;
    }

    nextPageIds.splice(toIndex, 0, movedPageId);
    setIsWorking(true);
    setError(null);

    try {
      await apiClient.setBookPages(book.id, { pageIds: nextPageIds });
      await reloadBook(activePageId);
    } catch (moveError: unknown) {
      setError(getErrorMessage(moveError));
    } finally {
      setIsWorking(false);
    }
  };

  const navigateBook = (direction: -1 | 1) => {
    if (viewMode === "spread" && book) {
      const nextSpread = book.spreads[activeSpreadIndex + direction];
      const nextSpreadPageId = nextSpread?.pageIds[0];

      if (nextSpreadPageId) {
        selectPage(nextSpreadPageId);
      }

      return;
    }

    const nextPageId = orderedPageIds[activePageIndex + direction];

    if (nextPageId) {
      selectPage(nextPageId);
    }
  };

  const exportBook = async (format: "pdf" | "png") => {
    if (!book || book.pages.length === 0) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      setExportJob(await apiClient.createExport({ bookId: book.id, format, preset: "print" }));
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    } finally {
      setIsWorking(false);
    }
  };

  const exportActivePage = async (format: "pdf" | "png") => {
    if (!activePage) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      setExportJob(
        await apiClient.createExport({ format, pageId: activePage.id, preset: "print" }),
      );
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading || !book) {
    return (
      <>
        <WorkspaceHeader title="Book editor">
          <button type="button" className="secondary-button" onClick={() => navigate("/books")}>
            Books
          </button>
        </WorkspaceHeader>
        {error ? (
          <p className="panel-alert" role="alert">
            {error}
          </p>
        ) : (
          <p className="empty-state">Loading book</p>
        )}
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader title={book.title}>
        <button type="button" className="secondary-button" onClick={() => navigate("/books")}>
          Books
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={isWorking || book.pages.length === 0}
          onClick={() => exportActivePage("png")}
        >
          Export page PNG
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={isWorking || book.pages.length === 0}
          onClick={() => exportBook("pdf")}
        >
          Export book PDF
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!activePage || activeStatus === "saving"}
          onClick={saveActivePage}
        >
          {activeStatus === "saving" ? "Saving" : "Save page"}
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
            Download {exportJob.targetKind} {exportJob.format.toUpperCase()}
          </a>
        </p>
      ) : null}
      <div className="book-editor-shell">
        <AssetRail assets={assets} onAddEmbellishment={addEmbellishment} onAddPhoto={addPhoto} />
        <section className="book-editor-stage" aria-label="Book editor">
          <form className="book-title-form" onSubmit={renameBook}>
            <label>
              <span>Book title</span>
              <input
                maxLength={120}
                value={bookTitleDraft}
                onChange={(event) => setBookTitleDraft(event.currentTarget.value)}
              />
            </label>
            <button type="submit" className="secondary-button" disabled={isWorking}>
              Rename
            </button>
          </form>
          <div className="book-modebar">
            <fieldset className="book-view-toggle">
              <legend className="visually-hidden">Editor view</legend>
              <button
                type="button"
                aria-pressed={viewMode === "page"}
                onClick={() => setViewMode("page")}
              >
                Page
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "spread"}
                onClick={() => setViewMode("spread")}
              >
                Spread
              </button>
            </fieldset>
            <div className="book-page-actions-inline">
              <button
                type="button"
                className="secondary-button"
                disabled={!canNavigatePrevious || isWorking}
                onClick={() => navigateBook(-1)}
              >
                Previous
              </button>
              <span>{navigationLabel}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={!canNavigateNext || isWorking}
                onClick={() => navigateBook(1)}
              >
                Next
              </button>
            </div>
            <div className="book-page-actions-inline">
              <button
                type="button"
                className="secondary-button"
                disabled={isWorking}
                onClick={addPage}
              >
                Add page
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!activePage || isWorking}
                onClick={duplicateActivePage}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={activePageIndex <= 0 || isWorking}
                onClick={() => moveActivePage(-1)}
              >
                Move left
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  activePageIndex < 0 || activePageIndex >= orderedPageIds.length - 1 || isWorking
                }
                onClick={() => moveActivePage(1)}
              >
                Move right
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!activePage || isWorking}
                onClick={deleteActivePage}
              >
                Delete
              </button>
            </div>
          </div>
          {activePage ? (
            <>
              <EditorToolbar
                document={activePage.document}
                status={activeStatus}
                title={activePage.title}
                onAddText={addText}
                onChangeBackground={(backgroundColor) =>
                  editPageDocument(
                    activePage.id,
                    updateCanvas(activePage.document, { backgroundColor }),
                  )
                }
                onChangeTitle={(nextTitle) => {
                  updatePageDetail(activePage.id, (page) => ({ ...page, title: nextTitle }));
                  setPageStatus(activePage.id, "unsaved");
                }}
              />
              <div className="book-canvas-deck" data-mode={viewMode}>
                {visiblePageIds.map((pageId) => {
                  const page = pageDetails.get(pageId);
                  const pageIndex = orderedPageIds.indexOf(pageId);

                  if (!page) {
                    return null;
                  }

                  return (
                    <section
                      className="book-page-frame"
                      data-active={pageId === activePage.id}
                      key={pageId}
                      aria-label={`Page ${pageIndex + 1}`}
                    >
                      <button
                        type="button"
                        className="book-page-tab"
                        aria-current={pageId === activePage.id ? "page" : undefined}
                        onClick={() => selectPage(pageId)}
                      >
                        <span>{`Page ${pageIndex + 1}`}</span>
                        <span>{page.title}</span>
                      </button>
                      <PageCanvas
                        assetById={assetById}
                        document={page.document}
                        selectedLayerId={pageId === activePage.id ? selectedLayerId : null}
                        onSelectLayer={(layerId) => selectPage(pageId, layerId)}
                        onTransformLayer={(layerId, update) =>
                          updateLayerTransform(pageId, layerId, update)
                        }
                      />
                    </section>
                  );
                })}
              </div>
              <ol className="book-filmstrip" aria-label="Book pages">
                {orderedPageIds.map((pageId, index) => {
                  const page = pageDetails.get(pageId);

                  return (
                    <li key={pageId}>
                      <button
                        type="button"
                        aria-current={pageId === activePage.id ? "page" : undefined}
                        onClick={() => selectPage(pageId)}
                      >
                        <span>{index + 1}</span>
                        <span>{page?.title ?? "Page"}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="empty-book-editor">
              <p>This book has no pages yet.</p>
              <button
                type="button"
                className="primary-button"
                disabled={isWorking}
                onClick={addPage}
              >
                Add first page
              </button>
            </div>
          )}
        </section>
        <aside className="editor-panel" aria-label="Layer controls">
          <div className="panel-heading compact-heading">
            <h3>Layers</h3>
            <span>{activePage?.document.layers.length ?? 0}</span>
          </div>
          {activePage ? (
            <>
              <LayerList
                document={activePage.document}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onChange={(nextDocument) => editPageDocument(activePage.id, nextDocument)}
              />
              <LayerInspector layer={selectedLayer} onChange={updateActiveLayer} />
            </>
          ) : (
            <p className="empty-state">Add a page to start editing.</p>
          )}
        </aside>
      </div>
    </>
  );
}
