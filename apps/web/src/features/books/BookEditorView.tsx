import { Button } from "@fluentui/react-components";
import { AddRegular, DeleteRegular, DismissRegular } from "@fluentui/react-icons";
import {
  addLayer,
  createEmbellishmentLayer,
  createPageDocument,
  createPhotoLayer,
  createStickerLayer,
  createTextLayer,
  createWashiTapeLayer,
  deleteLayer,
  type PageDocument,
  type PageLayer,
  reorderLayer,
  resizePageDocument,
  type StickerDefinition,
  updateCanvas,
  updateLayer,
  type WashiTapeLayer,
} from "@scrapbook/editor-core";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { apiClient } from "../../apiClient";
import { AppModal, ProcessingBanner, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { Asset, BookDetail, ExportJob, PageDetail } from "../../types";
import { AssetRail } from "../editor/AssetRail";
import type { EditorSaveStatus } from "../editor/editorTypes";
import type { EmbellishmentPreset } from "../editor/embellishments";
import type { CanvasPreviewLayer } from "../editor/PageCanvas";
import { PhotoPickerModal } from "../editor/PhotoPickerModal";
import { type PngExportSettings, PngExportSettingsModal } from "../editor/PngExportSettingsModal";
import { StickerPickerModal } from "../editor/StickerPickerModal";
import { BookCanvasDeck } from "./BookCanvasDeck";
import { BookEditorHeader } from "./BookEditorHeader";
import { BookFilmstrip } from "./BookFilmstrip";
import { BookLibraryPickerModal } from "./BookLibraryPickerModal";
import { BookModeBar } from "./BookModeBar";
import { BookSettingsModal } from "./BookSettingsModal";
import { fetchBookWithPages } from "./bookEditorData";
import {
  type BookEditorHistoryEntry,
  type EditHistoryMode,
  getChangedPageIds,
  useBookEditorHistory,
} from "./bookEditorHistory";
import type {
  LoadedBook,
  PageDropPosition,
  PageDropTarget,
  PngExportTarget,
  ViewMode,
} from "./bookEditorTypes";
import { PageSettingsPanel } from "./PageSettingsPanel";
import {
  customBookPageSizeKey,
  defaultBookPageSize,
  getBookPageSizeByKey,
  getBookPageSizeKey,
} from "./pageSizes";
import {
  getSpreadPageContexts,
  layerOverlapsPageCanvas,
  replacePageDocument,
  type SpreadLayerSyncResult,
  syncLayerAcrossSpread,
} from "./spreadLayers";

type PhotoPickerMode = { kind: "washiTapePattern"; layerId: string; pageId: string };

export function BookEditorView() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [bookTitleDraft, setBookTitleDraft] = useState("");
  const [bookPageSizeDraft, setBookPageSizeDraft] = useState<string>(defaultBookPageSize.key);
  const [coverSpreadEnabledDraft, setCoverSpreadEnabledDraft] = useState(true);
  const [pageDetails, setPageDetails] = useState<Map<string, PageDetail>>(new Map());
  const [pageStatuses, setPageStatuses] = useState<Record<string, EditorSaveStatus>>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("spread");
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [pendingExportFormat, setPendingExportFormat] = useState<"pdf" | "png" | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [isBookSettingsOpen, setIsBookSettingsOpen] = useState(false);
  const [isDeleteBookConfirmationOpen, setIsDeleteBookConfirmationOpen] = useState(false);
  const [photoPickerMode, setPhotoPickerMode] = useState<PhotoPickerMode | null>(null);
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [pngExportTarget, setPngExportTarget] = useState<PngExportTarget | null>(null);
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [pageDropTarget, setPageDropTarget] = useState<PageDropTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { endHistoryGroup, recordHistory, redoHistory, resetHistory, undoHistory } =
    useBookEditorHistory<BookEditorHistoryEntry>();

  const applyLoadedBook = useCallback(
    (loadedBook: LoadedBook, preferredPageId: string | null) => {
      const detailsById = new Map(loadedBook.pages.map((page) => [page.id, page]));
      const orderedPageIds = loadedBook.book.pages.map((bookPage) => bookPage.pageId);
      const nextActivePageId =
        preferredPageId && orderedPageIds.includes(preferredPageId)
          ? preferredPageId
          : (orderedPageIds[0] ?? null);

      setBook(loadedBook.book);
      setBookTitleDraft(loadedBook.book.title);
      setBookPageSizeDraft(getBookPageSizeKey(loadedBook.book));
      setCoverSpreadEnabledDraft(loadedBook.book.coverSpreadEnabled);
      setPageDetails(detailsById);
      resetHistory();
      setPageStatuses(Object.fromEntries(loadedBook.pages.map((page) => [page.id, "saved"])));
      setActivePageId(nextActivePageId);
      setSelectedLayerIds([]);
    },
    [resetHistory],
  );

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
        apiClient.listBookAssets(bookId),
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
  const visiblePageNames = visiblePageIds
    .map((pageId) => pageDetails.get(pageId)?.title)
    .filter((title): title is string => Boolean(title));
  const leftPageName = visiblePageNames[0] ?? navigationLabel;
  const rightPageName = visiblePageNames[visiblePageNames.length - 1] ?? leftPageName;
  const editingPage = editingPageId ? (pageDetails.get(editingPageId) ?? null) : null;
  const editingPageIndex = editingPageId ? orderedPageIds.indexOf(editingPageId) : -1;
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectPage = (pageId: string, layerId: string | null = null) => {
    setActivePageId(pageId);
    setSelectedLayerIds(layerId ? [layerId] : []);
  };

  const selectLayer = (
    pageId: string,
    layerId: string | null,
    options?: { additive?: boolean },
  ) => {
    setActivePageId(pageId);
    if (layerId === null) {
      setSelectedLayerIds([]);
      return;
    }
    if (options?.additive) {
      setSelectedLayerIds((currentIds) =>
        currentIds.includes(layerId)
          ? currentIds.filter((id) => id !== layerId)
          : [...currentIds, layerId],
      );
      return;
    }
    setSelectedLayerIds([layerId]);
  };

  const setPageStatus = (pageId: string, status: EditorSaveStatus) => {
    setPageStatuses((currentStatuses) => ({ ...currentStatuses, [pageId]: status }));
  };

  const setPagesStatus = useCallback((pageIds: string[], status: EditorSaveStatus) => {
    if (pageIds.length === 0) {
      return;
    }

    setPageStatuses((currentStatuses) => ({
      ...currentStatuses,
      ...Object.fromEntries(pageIds.map((pageId) => [pageId, status])),
    }));
  }, []);

  const createHistoryEntry = useCallback(
    (): BookEditorHistoryEntry => ({
      activePageId,
      editingPageId,
      pageDetails: new Map(pageDetails),
      selectedLayerIds,
    }),
    [activePageId, editingPageId, pageDetails, selectedLayerIds],
  );

  const applyHistoryEntry = useCallback(
    (entry: BookEditorHistoryEntry) => {
      const changedPageIds = getChangedPageIds(pageDetails, entry.pageDetails);
      const nextActivePageId =
        entry.activePageId && entry.pageDetails.has(entry.activePageId)
          ? entry.activePageId
          : (orderedPageIds.find((pageId) => entry.pageDetails.has(pageId)) ?? null);
      const nextEditingPageId =
        entry.editingPageId && entry.pageDetails.has(entry.editingPageId)
          ? entry.editingPageId
          : null;

      setPageDetails(new Map(entry.pageDetails));
      setActivePageId(nextActivePageId);
      setSelectedLayerIds(entry.selectedLayerIds);
      setEditingPageId(nextEditingPageId);
      setPagesStatus(changedPageIds, "unsaved");
    },
    [orderedPageIds, pageDetails, setPagesStatus],
  );

  const recordEditorHistory = useCallback(
    (historyMode: EditHistoryMode = "record") => {
      recordHistory(createHistoryEntry, historyMode);
    },
    [createHistoryEntry, recordHistory],
  );

  const undoBookEdit = useCallback(() => {
    undoHistory({ applyEntry: applyHistoryEntry, createEntry: createHistoryEntry });
  }, [applyHistoryEntry, createHistoryEntry, undoHistory]);

  const redoBookEdit = useCallback(() => {
    redoHistory({ applyEntry: applyHistoryEntry, createEntry: createHistoryEntry });
  }, [applyHistoryEntry, createHistoryEntry, redoHistory]);

  const updatePageDetail = (
    pageId: string,
    update: (page: PageDetail) => PageDetail,
    historyMode: EditHistoryMode = "record",
  ) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    recordEditorHistory(historyMode);
    setPageDetails((currentDetails) => {
      const currentPage = currentDetails.get(pageId);

      if (!currentPage) {
        return currentDetails;
      }

      const nextDetails = new Map(currentDetails);
      nextDetails.set(pageId, update(currentPage));

      return nextDetails;
    });
  };

  const editPageDocument = (
    pageId: string,
    nextDocument: PageDocument,
    historyMode: EditHistoryMode = "record",
  ) => {
    updatePageDetail(pageId, (page) => replacePageDocument(page, nextDocument), historyMode);
    setPageStatus(pageId, "unsaved");
  };

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        isBookSettingsOpen ||
        photoPickerMode !== null ||
        isLibraryPickerOpen ||
        isStickerPickerOpen ||
        pngExportTarget
      ) {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        redoBookEdit();
        return;
      }

      undoBookEdit();
    };

    document.addEventListener("keydown", handleHistoryShortcut);

    return () => document.removeEventListener("keydown", handleHistoryShortcut);
  }, [
    isBookSettingsOpen,
    photoPickerMode,
    isLibraryPickerOpen,
    isStickerPickerOpen,
    pngExportTarget,
    redoBookEdit,
    undoBookEdit,
  ]);

  useEffect(() => {
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.key !== "Delete" && event.key !== "Backspace") ||
        isBookSettingsOpen ||
        photoPickerMode !== null ||
        isLibraryPickerOpen ||
        isStickerPickerOpen ||
        pngExportTarget ||
        editingPageId
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (!activePageId || selectedLayerIds.length === 0) {
        return;
      }

      event.preventDefault();

      for (const layerId of selectedLayerIds) {
        deletePageLayerRef.current(activePageId, layerId);
      }
    };

    document.addEventListener("keydown", handleDeleteShortcut);

    return () => document.removeEventListener("keydown", handleDeleteShortcut);
  }, [
    activePageId,
    editingPageId,
    isBookSettingsOpen,
    isLibraryPickerOpen,
    isStickerPickerOpen,
    photoPickerMode,
    pngExportTarget,
    selectedLayerIds,
  ]);

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
    options: {
      historyMode?: EditHistoryMode;
      selectContainingPage?: boolean;
      selectedLayerIds?: string[];
    } = {},
  ) => {
    if (result.changedPageIds.length > 0) {
      recordEditorHistory(options.historyMode);
    }

    setPageDetails(result.details);
    setPagesStatus(result.changedPageIds, "unsaved");

    if (options.selectContainingPage && result.containingPageId) {
      setActivePageId(result.containingPageId);
    }

    if (options.selectedLayerIds !== undefined) {
      setSelectedLayerIds(options.selectedLayerIds);
    }
  };

  const updateSharedSpreadLayer = ({
    removeNonOverlappingSource,
    selectContainingPage,
    sourceLayer,
    sourcePageId,
    historyMode,
  }: {
    historyMode?: EditHistoryMode;
    removeNonOverlappingSource: boolean;
    selectContainingPage: boolean;
    sourceLayer: PageLayer;
    sourcePageId: string;
  }) => {
    const syncOptions: {
      historyMode?: EditHistoryMode;
      selectContainingPage: boolean;
      selectedLayerIds: string[];
    } = { selectContainingPage, selectedLayerIds: [sourceLayer.id] };

    if (historyMode !== undefined) {
      syncOptions.historyMode = historyMode;
    }

    applySpreadLayerSync(
      syncLayerAcrossSpread({
        details: pageDetails,
        removeNonOverlappingSource,
        sourceLayer,
        sourcePageId,
        spreadPageIds: visiblePageIds,
      }),
      syncOptions,
    );
  };

  const updateLayerTransform = (
    pageId: string,
    layerId: string,
    update: Partial<PageLayer>,
    historyMode: EditHistoryMode = "record",
  ) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    const nextDocument = updateLayer(page.document, layerId, update);
    const nextLayer = nextDocument.layers.find((layer) => layer.id === layerId);

    if (viewMode === "spread" && nextLayer && visiblePageIds.length > 1) {
      updateSharedSpreadLayer({
        historyMode,
        removeNonOverlappingSource: false,
        selectContainingPage: false,
        sourceLayer: nextLayer,
        sourcePageId: pageId,
      });
      return;
    }

    editPageDocument(pageId, nextDocument, historyMode);
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
        historyMode: "group",
        removeNonOverlappingSource: true,
        selectContainingPage: true,
        sourceLayer: nextLayer,
        sourcePageId: pageId,
      });
      endHistoryGroup();
      return;
    }

    if (update) {
      editPageDocument(pageId, nextDocument, "group");
    }

    endHistoryGroup();
  };

  const updateLayerTransforms = (
    pageId: string,
    updates: { layerId: string; update: Partial<PageLayer> }[],
  ) => {
    if (updates.length === 0) return;
    const page = pageDetails.get(pageId);
    if (!page) return;
    let nextDocument = page.document;
    for (const { layerId, update } of updates) {
      nextDocument = updateLayer(nextDocument, layerId, update);
    }
    editPageDocument(pageId, nextDocument, "group");
  };

  const finishLayerTransforms = (
    pageId: string,
    updates: { layerId: string; update: Partial<PageLayer> }[] | null,
  ) => {
    if (updates && updates.length > 0) {
      updateLayerTransforms(pageId, updates);
    }
    endHistoryGroup();
  };

  const reorderPageLayer = (pageId: string, layerId: string, toIndex: number) => {
    const page = pageDetails.get(pageId);

    if (!page) {
      return;
    }

    const nextDocument = reorderLayer(page.document, layerId, toIndex);
    const layer = nextDocument.layers.find((candidateLayer) => candidateLayer.id === layerId);

    if (viewMode === "spread" && layer && visiblePageIds.length > 1) {
      const nextDetails = new Map(pageDetails);
      nextDetails.set(pageId, replacePageDocument(page, nextDocument));

      applySpreadLayerSync(
        syncLayerAcrossSpread({
          details: nextDetails,
          removeNonOverlappingSource: false,
          sourceLayer: layer,
          sourcePageId: pageId,
          spreadPageIds: visiblePageIds,
        }),
        { selectedLayerIds: [layerId] },
      );
      setActivePageId(pageId);
      return;
    }

    editPageDocument(pageId, nextDocument);
    setActivePageId(pageId);
    setSelectedLayerIds([layerId]);
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
      setSelectedLayerIds((currentIds) => currentIds.filter((id) => id !== layerId));
      return;
    }

    editPageDocument(pageId, deleteLayer(page.document, layerId));
    setActivePageId(pageId);
    setSelectedLayerIds((currentIds) => currentIds.filter((id) => id !== layerId));
  };

  const deletePageLayerRef = useRef(deletePageLayer);
  deletePageLayerRef.current = deletePageLayer;

  const addText = () => {
    if (!activePage) {
      return;
    }

    const layer = createTextLayer({ text: "New text" });
    editPageDocument(activePage.id, addLayer(activePage.document, layer));
    setSelectedLayerIds([layer.id]);
  };

  const addPhoto = (asset: Asset) => {
    if (!activePage) {
      return;
    }

    const layer = createPhotoLayer({
      assetId: asset.id,
      width: Math.min(activePage.document.canvas.width * 0.5, 1000),
      height: Math.min(activePage.document.canvas.height * 0.34, 760),
    });

    editPageDocument(activePage.id, addLayer(activePage.document, layer));
    setSelectedLayerIds([layer.id]);
  };

  const addWashiTape = () => {
    if (!activePage) {
      return;
    }

    const layer = createWashiTapeLayer({
      width: Math.min(activePage.document.canvas.width * 0.56, 1120),
      height: Math.min(activePage.document.canvas.height * 0.08, 220),
      x: activePage.document.canvas.width * 0.16,
      y: activePage.document.canvas.height * 0.16,
    });

    editPageDocument(activePage.id, addLayer(activePage.document, layer));
    setSelectedLayerIds([layer.id]);
  };

  const setWashiTapePhotoPattern = (asset: Asset) => {
    if (photoPickerMode?.kind !== "washiTapePattern") {
      return;
    }

    const page = pageDetails.get(photoPickerMode.pageId);
    const layer = page?.document.layers.find(
      (candidateLayer) => candidateLayer.id === photoPickerMode.layerId,
    );

    if (!page || layer?.kind !== "washiTape") {
      return;
    }

    editPageDocument(
      page.id,
      updateLayer(page.document, layer.id, {
        pattern: {
          ...layer.pattern,
          assetId: asset.id,
          kind: "customPhoto",
        },
      } as Partial<WashiTapeLayer> as Partial<PageLayer>),
    );
    setActivePageId(page.id);
    setSelectedLayerIds([layer.id]);
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
    setSelectedLayerIds([layer.id]);
  };

  const addSticker = (sticker: StickerDefinition) => {
    if (!activePage) {
      return;
    }

    const size = Math.min(
      activePage.document.canvas.width * 0.18,
      activePage.document.canvas.height * 0.18,
      420,
    );
    const layer = createStickerLayer({
      stickerId: sticker.id,
      width: size,
      height: size,
      x: activePage.document.canvas.width * 0.12,
      y: activePage.document.canvas.height * 0.12,
    });

    editPageDocument(activePage.id, addLayer(activePage.document, layer));
    setSelectedLayerIds([layer.id]);
  };

  const renameBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!book) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const pageSize = getBookPageSizeByKey(bookPageSizeDraft);
      const nextPageSize =
        bookPageSizeDraft === customBookPageSizeKey
          ? null
          : { width: pageSize.width, height: pageSize.height };
      const pageSizeChanged = Boolean(
        nextPageSize &&
          (book.pageWidth !== nextPageSize.width || book.pageHeight !== nextPageSize.height),
      );
      const updatedBook = await apiClient.updateBook(book.id, {
        title: bookTitleDraft,
        coverSpreadEnabled: coverSpreadEnabledDraft,
        ...(bookPageSizeDraft === customBookPageSizeKey
          ? {}
          : { pageWidth: pageSize.width, pageHeight: pageSize.height }),
      });

      if (pageSizeChanged && nextPageSize) {
        const resizedPages = orderedPageIds
          .map((pageId) => pageDetails.get(pageId))
          .filter((page): page is PageDetail => Boolean(page))
          .map((page) =>
            replacePageDocument(
              page,
              resizePageDocument(page.document, {
                width: nextPageSize.width,
                height: nextPageSize.height,
              }),
            ),
          );

        setPageDetails((currentDetails) => {
          const nextDetails = new Map(currentDetails);

          for (const page of resizedPages) {
            nextDetails.set(page.id, page);
          }

          return nextDetails;
        });
        setPagesStatus(
          resizedPages.map((page) => page.id),
          "saving",
        );

        await Promise.all(
          resizedPages.map((page) =>
            apiClient.updatePage(page.id, {
              document: page.document,
              title: page.title,
            }),
          ),
        );
        setPagesStatus(
          resizedPages.map((page) => page.id),
          "saved",
        );
      }

      setBook(updatedBook);
      setBookTitleDraft(updatedBook.title);
      setBookPageSizeDraft(getBookPageSizeKey(updatedBook));
      setCoverSpreadEnabledDraft(updatedBook.coverSpreadEnabled);
      setIsBookSettingsOpen(false);
    } catch (renameError: unknown) {
      setError(getErrorMessage(renameError));
    } finally {
      setIsWorking(false);
    }
  };

  const requestDeleteBook = () => {
    setIsBookSettingsOpen(false);
    setIsDeleteBookConfirmationOpen(true);
  };

  const deleteBook = async () => {
    if (!book) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      await apiClient.deleteBook(book.id);
      setIsDeleteBookConfirmationOpen(false);
      navigate("/books", { replace: true });
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError));
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
        document: createPageDocument({
          canvas: { width: book.pageWidth, height: book.pageHeight },
        }),
        title: `Page ${book.pages.length + 1}`,
      });
      const nextPageIds = [...orderedPageIds];
      const insertionIndex = Math.max(0, nextPageIds.length - 1);

      nextPageIds.splice(insertionIndex, 0, page.id);
      await apiClient.setBookPages(book.id, {
        pageIds: nextPageIds,
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

  const exportBook = async (format: "pdf" | "png", settings: Partial<PngExportSettings> = {}) => {
    if (!book || book.pages.length === 0) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setExportJob(null);
    setPendingExportFormat(format);

    try {
      setExportJob(
        await apiClient.createExport({
          bookId: book.id,
          ...(settings.dpi === undefined ? {} : { dpi: settings.dpi }),
          format,
          includeBackground: settings.includeBackground ?? true,
          preset: "print",
        }),
      );
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    } finally {
      setPendingExportFormat(null);
      setIsWorking(false);
    }
  };

  const submitPngExport = (settings: PngExportSettings) => {
    const target = pngExportTarget;

    setPngExportTarget(null);

    if (target === "book") {
      void exportBook("png", settings);
    }
  };

  const exportDownloadLabel = exportJob
    ? exportJob.targetKind === "book" && exportJob.format === "png"
      ? "Download book PNG ZIP"
      : `Download ${exportJob.targetKind} ${exportJob.format.toUpperCase()}`
    : "";
  const pendingExportLabel = pendingExportFormat
    ? pendingExportFormat === "png"
      ? "Preparing book PNG ZIP export"
      : "Preparing book PDF export"
    : null;

  const getSpreadPreviewLayers = (pageId: string): CanvasPreviewLayer[] => {
    if (viewMode !== "spread" || visibleSpreadPages.length < 2) {
      return [];
    }

    const targetPage = visibleSpreadPages.find((spreadPage) => spreadPage.pageId === pageId);

    if (!targetPage) {
      return [];
    }

    const existingLayerIds = new Set(targetPage.page.document.layers.map((layer) => layer.id));
    const previewLayers: CanvasPreviewLayer[] = [];

    for (const sourcePage of visibleSpreadPages) {
      if (sourcePage.pageId === pageId) {
        continue;
      }

      for (const [stackIndex, layer] of sourcePage.page.document.layers.entries()) {
        if (existingLayerIds.has(layer.id)) {
          continue;
        }

        const projectedLayer = {
          ...layer,
          x: sourcePage.offsetX + layer.x - targetPage.offsetX,
        };

        if (layerOverlapsPageCanvas(projectedLayer, targetPage.page.document)) {
          previewLayers.push({
            layer: projectedLayer,
            sourcePageId: sourcePage.pageId,
            stackIndex,
          });
        }
      }
    }

    return previewLayers;
  };

  if (isLoading || !book) {
    return (
      <>
        <WorkspaceHeader title="Book editor" />
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
      <BookEditorHeader
        title={book.title}
        hasPages={book.pages.length > 0}
        isWorking={isWorking}
        onEditSettings={() => setIsBookSettingsOpen(true)}
        onExportBookPdf={() => exportBook("pdf")}
        onExportBookPng={() => setPngExportTarget("book")}
      />
      {pngExportTarget ? (
        <PngExportSettingsModal
          eyebrow={book.title}
          closeDisabled={isWorking}
          onClose={() => setPngExportTarget(null)}
          onSubmit={submitPngExport}
        />
      ) : null}
      {photoPickerMode ? (
        <PhotoPickerModal
          actionLabel={photoPickerMode.kind === "washiTapePattern" ? "Use as pattern" : "Add"}
          assets={assets}
          eyebrow={activePage?.title ?? book.title}
          title={photoPickerMode.kind === "washiTapePattern" ? "Choose pattern photo" : "Add photo"}
          onAddPhoto={
            photoPickerMode.kind === "washiTapePattern" ? setWashiTapePhotoPattern : addPhoto
          }
          onClose={() => setPhotoPickerMode(null)}
        />
      ) : null}
      {isLibraryPickerOpen ? (
        <BookLibraryPickerModal
          bookId={book.id}
          bookTitle={book.title}
          referencedAssetIds={new Set(assets.map((asset) => asset.id))}
          onAdded={(referencedAssets) => setAssets(referencedAssets)}
          onClose={() => setIsLibraryPickerOpen(false)}
        />
      ) : null}
      {isStickerPickerOpen ? (
        <StickerPickerModal
          eyebrow={activePage?.title ?? book.title}
          onAddSticker={addSticker}
          onClose={() => setIsStickerPickerOpen(false)}
        />
      ) : null}
      {isBookSettingsOpen ? (
        <BookSettingsModal
          book={book}
          closeDisabled={isWorking}
          coverSpreadEnabledDraft={coverSpreadEnabledDraft}
          pageSizeDraft={bookPageSizeDraft}
          titleDraft={bookTitleDraft}
          onClose={() => setIsBookSettingsOpen(false)}
          onCoverSpreadEnabledDraftChange={setCoverSpreadEnabledDraft}
          onDeleteRequest={requestDeleteBook}
          onPageSizeDraftChange={setBookPageSizeDraft}
          onSubmit={renameBook}
          onTitleDraftChange={setBookTitleDraft}
        />
      ) : null}
      {isDeleteBookConfirmationOpen ? (
        <AppModal
          title="Delete book?"
          eyebrow={book.title}
          size="compact"
          closeDisabled={isWorking}
          onClose={() => setIsDeleteBookConfirmationOpen(false)}
        >
          <div className="delete-book-confirmation">
            <p>This will remove the book from your library. This action cannot be undone.</p>
            <div className="delete-book-confirmation-actions">
              <Button
                type="button"
                className="secondary-button"
                disabled={isWorking}
                icon={<DismissRegular />}
                onClick={() => setIsDeleteBookConfirmationOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="danger-button"
                disabled={isWorking}
                icon={<DeleteRegular />}
                onClick={deleteBook}
              >
                Delete book
              </Button>
            </div>
          </div>
        </AppModal>
      ) : null}
      <div className="book-editor-notices">
        {error ? (
          <p className="panel-alert" role="alert">
            {error}
          </p>
        ) : null}
        {pendingExportLabel ? <ProcessingBanner>{pendingExportLabel}</ProcessingBanner> : null}
        {exportJob?.outputContentUrl ? (
          <p className="download-banner">
            <a href={exportJob.outputContentUrl} target="_blank" rel="noreferrer">
              {exportDownloadLabel}
            </a>
          </p>
        ) : null}
      </div>
      <div className="book-editor-shell">
        <AssetRail
          mode="referenced"
          referencedAssets={assets}
          isPhotoPickerDisabled={!activePage}
          isStickerPickerDisabled={!activePage}
          onAddEmbellishment={addEmbellishment}
          onAddPhoto={addPhoto}
          onAddText={addText}
          onOpenLibraryPicker={() => setIsLibraryPickerOpen(true)}
          onOpenStickerPicker={() => setIsStickerPickerOpen(true)}
          onOpenWashiTapePicker={addWashiTape}
        />
        <section className="book-editor-stage" aria-label="Book editor">
          <BookModeBar
            canNavigateNext={canNavigateNext}
            canNavigatePrevious={canNavigatePrevious}
            isWorking={isWorking}
            leftPageName={leftPageName}
            navigationLabel={navigationLabel}
            rightPageName={rightPageName}
            viewMode={viewMode}
            onNavigate={navigateBook}
            onViewModeChange={setViewMode}
          />
          {activePage ? (
            <>
              <BookCanvasDeck
                activePageId={activePage.id}
                assetById={assetById}
                getSpreadPreviewLayers={getSpreadPreviewLayers}
                orderedPageIds={orderedPageIds}
                pageDetails={pageDetails}
                selectedLayerIds={selectedLayerIds}
                viewMode={viewMode}
                visiblePageIds={visiblePageIds}
                onChooseWashiTapePhoto={(pageId, layerId) =>
                  setPhotoPickerMode({ kind: "washiTapePattern", pageId, layerId })
                }
                onDeleteLayer={deletePageLayer}
                onReorderLayer={reorderPageLayer}
                onSelectLayer={selectLayer}
                onTransformEnd={finishLayerTransform}
                onTransformLayers={updateLayerTransforms}
                onTransformLayersEnd={finishLayerTransforms}
                onUpdateLayerTransform={updateLayerTransform}
              />
              {editingPage && editingPageId ? (
                <PageSettingsPanel
                  isWorking={isWorking}
                  page={editingPage}
                  pageId={editingPageId}
                  pageIndex={editingPageIndex}
                  onChangeBackground={changePageBackground}
                  onChangeTitle={changePageTitle}
                  onClose={() => setEditingPageId(null)}
                  onDelete={deleteBookPage}
                  onDuplicate={duplicateBookPage}
                />
              ) : null}
              <BookFilmstrip
                activePageId={activePage.id}
                draggedPageId={draggedPageId}
                editingPageId={editingPageId}
                isWorking={isWorking}
                orderedPageIds={orderedPageIds}
                pageDetails={pageDetails}
                pageDropTarget={pageDropTarget}
                selectedPageIds={visiblePageIds}
                onAddPage={addPage}
                onClearDragState={clearPageDragState}
                onDragOver={handlePageDragOver}
                onDragStart={handlePageDragStart}
                onDrop={(event, pageId) => void handlePageDrop(event, pageId)}
                onSelectPage={selectPage}
                onTogglePageSettings={(pageId) => {
                  selectPage(pageId);
                  setEditingPageId((currentPageId) => (currentPageId === pageId ? null : pageId));
                }}
              />
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
