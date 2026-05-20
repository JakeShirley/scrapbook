import { Button, Field, Input, Tab, TabList } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowDownloadRegular,
  ArrowLeftRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  CopyRegular,
  DeleteRegular,
  DismissRegular,
  DocumentPdfRegular,
  EditRegular,
  RenameRegular,
  ReOrderDotsVerticalRegular,
} from "@fluentui/react-icons";
import {
  addLayer,
  createEmbellishmentLayer,
  createPageDocument,
  createPhotoLayer,
  createTextLayer,
  deleteLayer,
  type PageDocument,
  type PageLayer,
  reorderLayer,
  updateCanvas,
  updateLayer,
} from "@scrapbook/editor-core";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { apiClient } from "../../apiClient";
import { WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { Asset, BookDetail, ExportJob, PageDetail } from "../../types";
import { AssetRail } from "../editor/AssetRail";
import type { EditorSaveStatus } from "../editor/editorTypes";
import type { EmbellishmentPreset } from "../editor/embellishments";
import { PageCanvas } from "../editor/PageCanvas";

type ViewMode = "page" | "spread";

type PageDropPosition = "before" | "after";

type LoadedBook = {
  book: BookDetail;
  pages: PageDetail[];
};

type SpreadPageContext = {
  offsetX: number;
  page: PageDetail;
  pageId: string;
};

type SpreadLayerSyncResult = {
  changedPageIds: string[];
  containingPageId: string | null;
  details: Map<string, PageDetail>;
};

const replacePageDocument = (page: PageDetail, document: PageDocument): PageDetail => ({
  ...page,
  document,
  height: document.canvas.height,
  layerCount: document.layers.length,
  width: document.canvas.width,
});

const getSpreadPageContexts = (
  details: Map<string, PageDetail>,
  pageIds: string[],
): SpreadPageContext[] => {
  let offsetX = 0;
  const pages: SpreadPageContext[] = [];

  for (const pageId of pageIds) {
    const page = details.get(pageId);

    if (!page) {
      continue;
    }

    pages.push({ offsetX, page, pageId });
    offsetX += page.document.canvas.width;
  }

  return pages;
};

const layerOverlapsPageCanvas = (layer: PageLayer, document: PageDocument): boolean =>
  layer.x < document.canvas.width &&
  layer.x + layer.width > 0 &&
  layer.y < document.canvas.height &&
  layer.y + layer.height > 0;

const syncLayerAcrossSpread = ({
  details,
  removeNonOverlappingSource,
  sourceLayer,
  sourcePageId,
  spreadPageIds,
}: {
  details: Map<string, PageDetail>;
  removeNonOverlappingSource: boolean;
  sourceLayer: PageLayer;
  sourcePageId: string;
  spreadPageIds: string[];
}): SpreadLayerSyncResult => {
  const spreadPages = getSpreadPageContexts(details, spreadPageIds);
  const sourceContext = spreadPages.find((spreadPage) => spreadPage.pageId === sourcePageId);

  if (!sourceContext || spreadPages.length < 2) {
    const sourcePage = details.get(sourcePageId);

    if (!sourcePage) {
      return { changedPageIds: [], containingPageId: null, details };
    }

    return {
      changedPageIds: [sourcePageId],
      containingPageId: sourcePageId,
      details: new Map(details).set(
        sourcePageId,
        replacePageDocument(
          sourcePage,
          updateLayer(sourcePage.document, sourceLayer.id, sourceLayer),
        ),
      ),
    };
  }

  const nextDetails = new Map(details);
  const changedPageIds = new Set<string>();
  const sourceLayerIndex = sourceContext.page.document.layers.findIndex(
    (layer) => layer.id === sourceLayer.id,
  );
  const spreadX = sourceContext.offsetX + sourceLayer.x;
  const spreadCenterX = spreadX + sourceLayer.width / 2;
  const containingPage = spreadPages.find(
    (spreadPage) =>
      spreadCenterX >= spreadPage.offsetX &&
      spreadCenterX < spreadPage.offsetX + spreadPage.page.document.canvas.width,
  );
  const ownerPage =
    containingPage ??
    spreadPages.reduce((closestPage, spreadPage) => {
      const closestDistance = Math.min(
        Math.abs(spreadCenterX - closestPage.offsetX),
        Math.abs(spreadCenterX - (closestPage.offsetX + closestPage.page.document.canvas.width)),
      );
      const spreadPageDistance = Math.min(
        Math.abs(spreadCenterX - spreadPage.offsetX),
        Math.abs(spreadCenterX - (spreadPage.offsetX + spreadPage.page.document.canvas.width)),
      );

      return spreadPageDistance < closestDistance ? spreadPage : closestPage;
    }, sourceContext);
  const projectedLayers = spreadPages.map((spreadPage) => {
    const currentPage = nextDetails.get(spreadPage.pageId) ?? spreadPage.page;
    const localLayer = { ...sourceLayer, x: spreadX - spreadPage.offsetX };

    return {
      currentPage,
      localLayer,
      overlapsPage: layerOverlapsPageCanvas(localLayer, currentPage.document),
      spreadPage,
    };
  });
  const overlapsAnyPage = projectedLayers.some((projectedLayer) => projectedLayer.overlapsPage);

  for (const { currentPage, localLayer, overlapsPage, spreadPage } of projectedLayers) {
    const existingLayer = currentPage.document.layers.find((layer) => layer.id === sourceLayer.id);

    if (existingLayer && existingLayer.kind !== sourceLayer.kind) {
      continue;
    }

    const shouldKeepLayer =
      overlapsPage ||
      (!removeNonOverlappingSource && spreadPage.pageId === sourcePageId) ||
      (!overlapsAnyPage && spreadPage.pageId === ownerPage.pageId);
    let nextDocument = currentPage.document;

    if (shouldKeepLayer) {
      nextDocument = existingLayer
        ? updateLayer(currentPage.document, sourceLayer.id, localLayer)
        : addLayer(
            currentPage.document,
            localLayer,
            Math.max(0, Math.min(sourceLayerIndex, currentPage.document.layers.length)),
          );
    } else if (existingLayer) {
      nextDocument = deleteLayer(currentPage.document, sourceLayer.id);
    }

    if (nextDocument !== currentPage.document) {
      nextDetails.set(spreadPage.pageId, replacePageDocument(currentPage, nextDocument));
      changedPageIds.add(spreadPage.pageId);
    }
  }

  return {
    changedPageIds: [...changedPageIds],
    containingPageId: ownerPage.pageId,
    details: nextDetails,
  };
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
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [pageDropTarget, setPageDropTarget] = useState<{
    pageId: string;
    position: PageDropPosition;
  } | null>(null);
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
  const activeSpreadIndex =
    book?.spreads.findIndex((spread) => activePageId && spread.pageIds.includes(activePageId)) ??
    -1;
  const activeSpread =
    activeSpreadIndex >= 0
      ? (book?.spreads[activeSpreadIndex] ?? null)
      : (book?.spreads[0] ?? null);
  const visiblePageIds =
    viewMode === "spread" ? (activeSpread?.pageIds ?? []) : activePageId ? [activePageId] : [];
  const visibleSpreadPages = useMemo(
    () => (viewMode === "spread" ? getSpreadPageContexts(pageDetails, visiblePageIds) : []),
    [pageDetails, viewMode, visiblePageIds],
  );
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
  const editingPage = editingPageId ? (pageDetails.get(editingPageId) ?? null) : null;
  const editingPageIndex = editingPageId ? orderedPageIds.indexOf(editingPageId) : -1;
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
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

  const setPagesStatus = (pageIds: string[], status: EditorSaveStatus) => {
    if (pageIds.length === 0) {
      return;
    }

    setPageStatuses((currentStatuses) => ({
      ...currentStatuses,
      ...Object.fromEntries(pageIds.map((pageId) => [pageId, status])),
    }));
  };

  const editPageDocument = (pageId: string, nextDocument: PageDocument) => {
    updatePageDetail(pageId, (page) => replacePageDocument(page, nextDocument));
    setPageStatus(pageId, "unsaved");
  };

  const changePageTitle = (pageId: string, title: string) => {
    updatePageDetail(pageId, (page) => ({ ...page, title }));
    setPageStatus(pageId, "unsaved");
  };

  const changePageBackground = (pageId: string, backgroundColor: string) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    editPageDocument(pageId, updateCanvas(page.document, { backgroundColor }));
  };

  useEffect(() => {
    const unsavedPageIds = Object.entries(pageStatuses)
      .filter(([pageId, status]) => status === "unsaved" && pageDetails.has(pageId))
      .map(([pageId]) => pageId);

    if (unsavedPageIds.length === 0) {
      return;
    }

    const autosaveTimer = window.setTimeout(() => {
      const pagesToSave = unsavedPageIds
        .map((pageId) => pageDetails.get(pageId))
        .filter((page): page is PageDetail => Boolean(page));

      if (pagesToSave.length === 0) {
        return;
      }

      setPageStatuses((currentStatuses) => ({
        ...currentStatuses,
        ...Object.fromEntries(pagesToSave.map((page) => [page.id, "saving"])),
      }));

      void Promise.allSettled(
        pagesToSave.map((page) =>
          apiClient.updatePage(page.id, {
            document: page.document,
            title: page.title,
          }),
        ),
      ).then((saveResults) => {
        const savedPageIds: string[] = [];
        const failedPageIds: string[] = [];
        const firstFailure = saveResults.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );

        for (const [index, saveResult] of saveResults.entries()) {
          const page = pagesToSave[index];

          if (!page) {
            continue;
          }

          if (saveResult.status === "fulfilled") {
            savedPageIds.push(page.id);
          } else {
            failedPageIds.push(page.id);
          }
        }

        if (savedPageIds.length > 0) {
          setPageStatuses((currentStatuses) => ({
            ...currentStatuses,
            ...Object.fromEntries(
              savedPageIds
                .filter((pageId) => currentStatuses[pageId] === "saving")
                .map((pageId) => [pageId, "saved"]),
            ),
          }));
        }

        if (failedPageIds.length > 0) {
          setPageStatuses((currentStatuses) => ({
            ...currentStatuses,
            ...Object.fromEntries(
              failedPageIds
                .filter((pageId) => currentStatuses[pageId] === "saving")
                .map((pageId) => [pageId, "error"]),
            ),
          }));
          setError(getErrorMessage(firstFailure?.reason ?? "Failed to save page"));
        }
      });
    }, 700);

    return () => window.clearTimeout(autosaveTimer);
  }, [pageDetails, pageStatuses]);

  const applySpreadLayerSync = (
    result: SpreadLayerSyncResult,
    options: { selectContainingPage?: boolean; selectedLayerId?: string } = {},
  ) => {
    setPageDetails(result.details);
    setPagesStatus(result.changedPageIds, "unsaved");

    if (options.selectContainingPage && result.containingPageId) {
      setActivePageId(result.containingPageId);
    }

    if (options.selectedLayerId !== undefined) {
      setSelectedLayerId(options.selectedLayerId);
    }
  };

  const updateSharedSpreadLayer = ({
    removeNonOverlappingSource,
    selectContainingPage,
    sourceLayer,
    sourcePageId,
  }: {
    removeNonOverlappingSource: boolean;
    selectContainingPage: boolean;
    sourceLayer: PageLayer;
    sourcePageId: string;
  }) => {
    applySpreadLayerSync(
      syncLayerAcrossSpread({
        details: pageDetails,
        removeNonOverlappingSource,
        sourceLayer,
        sourcePageId,
        spreadPageIds: visiblePageIds,
      }),
      { selectContainingPage, selectedLayerId: sourceLayer.id },
    );
  };

  const updateLayerTransform = (pageId: string, layerId: string, update: Partial<PageLayer>) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    const nextDocument = updateLayer(page.document, layerId, update);
    const nextLayer = nextDocument.layers.find((layer) => layer.id === layerId);

    if (viewMode === "spread" && nextLayer && visiblePageIds.length > 1) {
      updateSharedSpreadLayer({
        removeNonOverlappingSource: false,
        selectContainingPage: false,
        sourceLayer: nextLayer,
        sourcePageId: pageId,
      });
      return;
    }

    editPageDocument(pageId, nextDocument);
  };

  const finishLayerTransform = (
    pageId: string,
    layerId: string,
    update: Partial<PageLayer> | null,
  ) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    const nextDocument = update ? updateLayer(page.document, layerId, update) : page.document;
    const nextLayer = nextDocument.layers.find((layer) => layer.id === layerId);

    if (viewMode === "spread" && nextLayer && visiblePageIds.length > 1) {
      updateSharedSpreadLayer({
        removeNonOverlappingSource: true,
        selectContainingPage: true,
        sourceLayer: nextLayer,
        sourcePageId: pageId,
      });
      return;
    }

    if (update) {
      editPageDocument(pageId, nextDocument);
    }
  };

  const reorderPageLayer = (pageId: string, layerId: string, toIndex: number) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    const layer = page.document.layers.find((candidateLayer) => candidateLayer.id === layerId);

    if (viewMode === "spread" && layer && visiblePageIds.length > 1) {
      const nextDetails = new Map(pageDetails);
      const changedPageIds: string[] = [];

      for (const spreadPage of visibleSpreadPages) {
        const currentPage = nextDetails.get(spreadPage.pageId);

        if (!currentPage?.document.layers.some((candidateLayer) => candidateLayer.id === layerId)) {
          continue;
        }

        nextDetails.set(
          spreadPage.pageId,
          replacePageDocument(currentPage, reorderLayer(currentPage.document, layerId, toIndex)),
        );
        changedPageIds.push(spreadPage.pageId);
      }

      applySpreadLayerSync(
        { changedPageIds, containingPageId: pageId, details: nextDetails },
        { selectedLayerId: layerId },
      );
      setActivePageId(pageId);
      return;
    }

    editPageDocument(pageId, reorderLayer(page.document, layerId, toIndex));
    setActivePageId(pageId);
    setSelectedLayerId(layerId);
  };

  const deletePageLayer = (pageId: string, layerId: string) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    const layer = page.document.layers.find((candidateLayer) => candidateLayer.id === layerId);

    if (viewMode === "spread" && layer && visiblePageIds.length > 1) {
      const nextDetails = new Map(pageDetails);
      const changedPageIds: string[] = [];

      for (const spreadPage of visibleSpreadPages) {
        const currentPage = nextDetails.get(spreadPage.pageId);

        if (!currentPage?.document.layers.some((candidateLayer) => candidateLayer.id === layerId)) {
          continue;
        }

        nextDetails.set(
          spreadPage.pageId,
          replacePageDocument(currentPage, deleteLayer(currentPage.document, layerId)),
        );
        changedPageIds.push(spreadPage.pageId);
      }

      applySpreadLayerSync({ changedPageIds, containingPageId: pageId, details: nextDetails });
      setActivePageId(pageId);
      setSelectedLayerId((currentLayerId) => (currentLayerId === layerId ? null : currentLayerId));
      return;
    }

    editPageDocument(pageId, deleteLayer(page.document, layerId));
    setActivePageId(pageId);
    setSelectedLayerId((currentLayerId) => (currentLayerId === layerId ? null : currentLayerId));
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

  const duplicateBookPage = async (pageId: string) => {
    if (!book) {
      return;
    }

    const page = pageDetails.get(pageId);
    const pageIndex = orderedPageIds.indexOf(pageId);

    if (!page || pageIndex < 0) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const duplicated = await apiClient.duplicatePage(page.id, {
        title: `${page.title} copy`,
      });
      const nextPageIds = [...orderedPageIds];
      nextPageIds.splice(pageIndex + 1, 0, duplicated.id);
      await apiClient.setBookPages(book.id, { pageIds: nextPageIds });
      setEditingPageId(duplicated.id);
      await reloadBook(duplicated.id);
    } catch (duplicateError: unknown) {
      setError(getErrorMessage(duplicateError));
    } finally {
      setIsWorking(false);
    }
  };

  const deleteBookPage = async (pageId: string) => {
    if (!book) {
      return;
    }

    const page = pageDetails.get(pageId);
    const pageIndex = orderedPageIds.indexOf(pageId);

    if (!page || pageIndex < 0) {
      return;
    }

    const nextPageIds = orderedPageIds.filter((orderedPageId) => orderedPageId !== pageId);
    const nextActivePageId =
      activePageId === pageId
        ? (nextPageIds[pageIndex] ?? nextPageIds[pageIndex - 1] ?? null)
        : activePageId;

    setIsWorking(true);
    setError(null);

    try {
      await apiClient.setBookPages(book.id, { pageIds: nextPageIds });
      await apiClient.deletePage(page.id);
      setEditingPageId((currentPageId) => (currentPageId === page.id ? null : currentPageId));
      await reloadBook(nextActivePageId);
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsWorking(false);
    }
  };

  const reorderBookPages = async (
    sourcePageId: string,
    targetPageId: string,
    position: PageDropPosition,
  ) => {
    if (!book || sourcePageId === targetPageId) {
      return;
    }

    const sourceIndex = orderedPageIds.indexOf(sourcePageId);
    const targetIndex = orderedPageIds.indexOf(targetPageId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const targetDropIndex = targetIndex + (position === "after" ? 1 : 0);
    const insertionIndex = sourceIndex < targetDropIndex ? targetDropIndex - 1 : targetDropIndex;
    const nextPageIds = [...orderedPageIds];
    const [movedPageId] = nextPageIds.splice(sourceIndex, 1);

    if (!movedPageId) {
      return;
    }

    nextPageIds.splice(Math.max(0, Math.min(insertionIndex, nextPageIds.length)), 0, movedPageId);

    if (nextPageIds.every((pageId, index) => pageId === orderedPageIds[index])) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      await apiClient.setBookPages(book.id, { pageIds: nextPageIds });
      await reloadBook(activePageId);
    } catch (reorderError: unknown) {
      setError(getErrorMessage(reorderError));
    } finally {
      setIsWorking(false);
    }
  };

  const getPageDropPosition = (event: DragEvent<HTMLElement>): PageDropPosition => {
    const targetBounds = event.currentTarget.getBoundingClientRect();

    return event.clientX > targetBounds.left + targetBounds.width / 2 ? "after" : "before";
  };

  const handlePageDragStart = (event: DragEvent<HTMLLIElement>, pageId: string) => {
    if (isWorking) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    setDraggedPageId(pageId);
  };

  const handlePageDragOver = (event: DragEvent<HTMLLIElement>, pageId: string) => {
    const sourcePageId = draggedPageId ?? event.dataTransfer.getData("text/plain");

    if (!sourcePageId || sourcePageId === pageId || isWorking) {
      setPageDropTarget(null);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setPageDropTarget({ pageId, position: getPageDropPosition(event) });
  };

  const handlePageDrop = async (event: DragEvent<HTMLLIElement>, pageId: string) => {
    event.preventDefault();

    const sourcePageId = draggedPageId ?? event.dataTransfer.getData("text/plain");
    const position = getPageDropPosition(event);
    setDraggedPageId(null);
    setPageDropTarget(null);

    if (!sourcePageId || isWorking) {
      return;
    }

    await reorderBookPages(sourcePageId, pageId, position);
  };

  const clearPageDragState = () => {
    setDraggedPageId(null);
    setPageDropTarget(null);
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

  const getSpreadPreviewLayers = (pageId: string): PageLayer[] => {
    if (viewMode !== "spread" || visibleSpreadPages.length < 2) {
      return [];
    }

    const targetPage = visibleSpreadPages.find((spreadPage) => spreadPage.pageId === pageId);

    if (!targetPage) {
      return [];
    }

    const existingLayerIds = new Set(targetPage.page.document.layers.map((layer) => layer.id));
    const previewLayers: PageLayer[] = [];

    for (const sourcePage of visibleSpreadPages) {
      if (sourcePage.pageId === pageId) {
        continue;
      }

      for (const layer of sourcePage.page.document.layers) {
        if (existingLayerIds.has(layer.id)) {
          continue;
        }

        const projectedLayer = {
          ...layer,
          x: sourcePage.offsetX + layer.x - targetPage.offsetX,
        };

        if (layerOverlapsPageCanvas(projectedLayer, targetPage.page.document)) {
          previewLayers.push(projectedLayer);
        }
      }
    }

    return previewLayers;
  };

  if (isLoading || !book) {
    return (
      <>
        <WorkspaceHeader title="Book editor">
          <Button
            type="button"
            className="secondary-button"
            icon={<ArrowLeftRegular />}
            onClick={() => navigate("/books")}
          >
            Books
          </Button>
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
    <div className="book-editor-page">
      <WorkspaceHeader title={book.title}>
        <Button
          type="button"
          className="secondary-button"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate("/books")}
        >
          Books
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={isWorking || book.pages.length === 0}
          icon={<ArrowDownloadRegular />}
          onClick={() => exportActivePage("png")}
        >
          Export page PNG
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={isWorking || book.pages.length === 0}
          icon={<ArrowDownloadRegular />}
          onClick={() => exportBook("png")}
        >
          Export book PNG
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={isWorking || book.pages.length === 0}
          icon={<DocumentPdfRegular />}
          onClick={() => exportBook("pdf")}
        >
          Export book PDF
        </Button>
      </WorkspaceHeader>
      <div className="book-editor-notices">
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
      </div>
      <div className="book-editor-shell">
        <AssetRail
          assets={assets}
          onAddEmbellishment={addEmbellishment}
          onAddPhoto={addPhoto}
          onAddText={addText}
        />
        <section className="book-editor-stage" aria-label="Book editor">
          <form className="book-title-form" onSubmit={renameBook}>
            <Field label="Book title">
              <Input
                maxLength={120}
                value={bookTitleDraft}
                onChange={(event) => setBookTitleDraft(event.currentTarget.value)}
              />
            </Field>
            <Button
              type="submit"
              className="secondary-button"
              disabled={isWorking}
              icon={<RenameRegular />}
            >
              Rename
            </Button>
          </form>
          <div className="book-modebar">
            <TabList
              className="book-view-toggle"
              aria-label="Editor view"
              selectedValue={viewMode}
              onTabSelect={(_, data) => setViewMode(data.value as ViewMode)}
            >
              <Tab value="page">Page</Tab>
              <Tab value="spread">Spread</Tab>
            </TabList>
            <div className="book-page-actions-inline">
              <Button
                type="button"
                className="secondary-button"
                disabled={!canNavigatePrevious || isWorking}
                icon={<ChevronLeftRegular />}
                onClick={() => navigateBook(-1)}
              >
                Previous
              </Button>
              <span>{navigationLabel}</span>
              <Button
                type="button"
                className="secondary-button"
                disabled={!canNavigateNext || isWorking}
                icon={<ChevronRightRegular />}
                onClick={() => navigateBook(1)}
              >
                Next
              </Button>
            </div>
          </div>
          {activePage ? (
            <>
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
                      <PageCanvas
                        assetById={assetById}
                        document={page.document}
                        previewLayers={getSpreadPreviewLayers(pageId)}
                        selectedLayerId={pageId === activePage.id ? selectedLayerId : null}
                        onDeleteLayer={(layerId) => deletePageLayer(pageId, layerId)}
                        onReorderLayer={(layerId, toIndex) =>
                          reorderPageLayer(pageId, layerId, toIndex)
                        }
                        onSelectLayer={(layerId) => selectPage(pageId, layerId)}
                        onTransformEnd={(layerId, update) =>
                          finishLayerTransform(pageId, layerId, update)
                        }
                        onTransformLayer={(layerId, update) =>
                          updateLayerTransform(pageId, layerId, update)
                        }
                      />
                    </section>
                  );
                })}
              </div>
              {editingPage && editingPageId ? (
                <form
                  className="page-card-editor"
                  aria-label={`Edit page ${editingPageIndex + 1}`}
                  onSubmit={(event) => event.preventDefault()}
                >
                  <div className="page-card-editor-heading">
                    <span>{`Page ${editingPageIndex + 1} settings`}</span>
                    <button
                      type="button"
                      aria-label="Close page settings"
                      title="Close"
                      onClick={() => setEditingPageId(null)}
                    >
                      <DismissRegular />
                    </button>
                  </div>
                  <label>
                    <span>Title</span>
                    <input
                      maxLength={120}
                      value={editingPage.title}
                      onChange={(event) =>
                        changePageTitle(editingPageId, event.currentTarget.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Background</span>
                    <input
                      type="color"
                      value={editingPage.document.canvas.backgroundColor}
                      onChange={(event) =>
                        changePageBackground(editingPageId, event.currentTarget.value)
                      }
                    />
                  </label>
                  <div className="page-card-editor-actions">
                    <Button
                      type="button"
                      className="secondary-button"
                      disabled={isWorking}
                      icon={<CopyRegular />}
                      onClick={() => duplicateBookPage(editingPageId)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      className="secondary-button"
                      disabled={isWorking}
                      icon={<DeleteRegular />}
                      onClick={() => deleteBookPage(editingPageId)}
                    >
                      Delete
                    </Button>
                  </div>
                </form>
              ) : null}
              <ol className="book-filmstrip" aria-label="Book pages">
                {orderedPageIds.map((pageId, index) => {
                  const page = pageDetails.get(pageId);
                  const pageStatus = pageStatuses[pageId] ?? "saved";

                  return (
                    <li
                      key={pageId}
                      data-dragging={draggedPageId === pageId}
                      data-drop-position={
                        pageDropTarget?.pageId === pageId ? pageDropTarget.position : undefined
                      }
                      data-editing={editingPageId === pageId}
                      draggable={!isWorking}
                      onDragEnd={clearPageDragState}
                      onDragOver={(event) => handlePageDragOver(event, pageId)}
                      onDragStart={(event) => handlePageDragStart(event, pageId)}
                      onDrop={(event) => void handlePageDrop(event, pageId)}
                    >
                      <button
                        type="button"
                        className="book-filmstrip-select"
                        aria-current={pageId === activePage.id ? "page" : undefined}
                        onClick={() => selectPage(pageId)}
                      >
                        <span className="book-filmstrip-index">{index + 1}</span>
                        <span className="book-filmstrip-title">{page?.title ?? "Page"}</span>
                        {pageStatus !== "saved" ? (
                          <span className={`book-filmstrip-status ${pageStatus}`}>
                            {pageStatus}
                          </span>
                        ) : null}
                      </button>
                      <span className="book-filmstrip-drag-handle" aria-hidden="true">
                        <ReOrderDotsVerticalRegular />
                      </span>
                      {page ? (
                        <button
                          type="button"
                          className="book-filmstrip-edit"
                          aria-label={`Edit page ${index + 1}`}
                          title="Edit page"
                          onClick={() => {
                            selectPage(pageId);
                            setEditingPageId((currentPageId) =>
                              currentPageId === pageId ? null : pageId,
                            );
                          }}
                        >
                          <EditRegular />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
                <li className="book-filmstrip-add">
                  <Button
                    type="button"
                    className="secondary-button book-filmstrip-add-button"
                    disabled={isWorking}
                    icon={<AddRegular />}
                    onClick={addPage}
                  >
                    Add page
                  </Button>
                </li>
              </ol>
            </>
          ) : (
            <div className="empty-book-editor">
              <p>This book has no pages yet.</p>
              <Button
                appearance="primary"
                type="button"
                className="primary-button"
                disabled={isWorking}
                icon={<AddRegular />}
                onClick={addPage}
              >
                Add first page
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
