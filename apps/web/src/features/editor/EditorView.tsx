import { Button } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowLeftRegular,
  CopyRegular,
  DeleteRegular,
  DocumentPdfRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import {
  addLayer,
  createEmbellishmentLayer,
  createPhotoLayer,
  createStickerLayer,
  createTextLayer,
  createWashiTapeLayer,
  deleteLayer,
  type PageDocument,
  type PageLayer,
  reorderLayer,
  type StickerDefinition,
  updateCanvas,
  updateLayer,
  type WashiTapeLayer,
} from "@scrapbook/editor-core";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { apiClient } from "../../apiClient";
import { ProcessingBanner, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { Asset, ExportJob, PageDetail } from "../../types";
import { AssetRail } from "./AssetRail";
import { EditorToolbar } from "./EditorToolbar";
import type { EditorSaveStatus } from "./editorTypes";
import type { EmbellishmentPreset } from "./embellishments";
import { PageCanvas } from "./PageCanvas";
import { PhotoPickerModal } from "./PhotoPickerModal";
import { type PngExportSettings, PngExportSettingsModal } from "./PngExportSettingsModal";
import { StickerPickerModal } from "./StickerPickerModal";

type PhotoPickerMode = { kind: "photo" } | { kind: "washiTapePattern"; layerId: string };

export function EditorView() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [document, setDocument] = useState<PageDocument | null>(null);
  const [title, setTitle] = useState("Untitled page");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [pendingExportFormat, setPendingExportFormat] = useState<"pdf" | "png" | null>(null);
  const [photoPickerMode, setPhotoPickerMode] = useState<PhotoPickerMode | null>(null);
  const [isPngExportSettingsOpen, setIsPngExportSettingsOpen] = useState(false);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [status, setStatus] = useState<EditorSaveStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!pageId) {
      navigate("/pages", { replace: true });
      return () => {
        isMounted = false;
      };
    }

    Promise.all([apiClient.getPage(pageId), apiClient.listAssets()])
      .then(([loadedPage, assetResponse]) => {
        if (isMounted) {
          setPage(loadedPage);
          setDocument(loadedPage.document);
          setTitle(loadedPage.title);
          setAssets(assetResponse.assets);
          setSelectedLayerId(null);
          setStatus("saved");
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError));
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, pageId]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const editDocument = (nextDocument: PageDocument) => {
    setDocument(nextDocument);
    setStatus("unsaved");
  };
  const updateLayerTransform = (layerId: string, update: Partial<PageLayer>) => {
    if (document) editDocument(updateLayer(document, layerId, update));
  };
  const reorderCanvasLayer = (layerId: string, toIndex: number) => {
    if (!document) return;
    editDocument(reorderLayer(document, layerId, toIndex));
    setSelectedLayerId(layerId);
  };
  const deleteCanvasLayer = (layerId: string) => {
    if (!document) return;
    editDocument(deleteLayer(document, layerId));
    setSelectedLayerId((currentLayerId) => (currentLayerId === layerId ? null : currentLayerId));
  };
  const addText = () => {
    if (!document) return;
    const layer = createTextLayer({ text: "New text" });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };
  const addPhoto = (asset: Asset) => {
    if (!document) return;
    const layer = createPhotoLayer({
      assetId: asset.id,
      width: Math.min(document.canvas.width * 0.5, 1000),
      height: Math.min(document.canvas.height * 0.34, 760),
    });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };
  const addWashiTape = () => {
    if (!document) return;
    const layer = createWashiTapeLayer({
      width: Math.min(document.canvas.width * 0.56, 1120),
      height: Math.min(document.canvas.height * 0.08, 220),
      x: document.canvas.width * 0.16,
      y: document.canvas.height * 0.16,
    });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };
  const setWashiTapePhotoPattern = (asset: Asset) => {
    if (!document || photoPickerMode?.kind !== "washiTapePattern") return;
    const layer = document.layers.find(
      (candidateLayer) => candidateLayer.id === photoPickerMode.layerId,
    );

    if (layer?.kind !== "washiTape") return;

    editDocument(
      updateLayer(document, layer.id, {
        pattern: {
          ...layer.pattern,
          assetId: asset.id,
          kind: "customPhoto",
        },
      } as Partial<WashiTapeLayer> as Partial<PageLayer>),
    );
    setSelectedLayerId(layer.id);
  };
  const addEmbellishment = (preset: EmbellishmentPreset) => {
    if (!document) return;
    const layer = createEmbellishmentLayer({
      ...preset,
      width: Math.min(document.canvas.width * 0.28, 620),
      height: Math.min(document.canvas.height * 0.12, 320),
      x: document.canvas.width * 0.12,
      y: document.canvas.height * 0.12,
    });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };
  const addSticker = (sticker: StickerDefinition) => {
    if (!document) return;
    const size = Math.min(document.canvas.width * 0.18, document.canvas.height * 0.18, 420);
    const layer = createStickerLayer({
      stickerId: sticker.id,
      width: size,
      height: size,
      x: document.canvas.width * 0.12,
      y: document.canvas.height * 0.12,
    });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };
  const savePage = async () => {
    if (!page || !document) return;
    setStatus("saving");
    setError(null);
    try {
      const savedPage = await apiClient.updatePage(page.id, { title, document });
      setPage(savedPage);
      setDocument(savedPage.document);
      setTitle(savedPage.title);
      setStatus("saved");
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError));
      setStatus("error");
    }
  };
  const duplicatePage = async () => {
    if (!page) return;
    setError(null);
    try {
      const duplicated = await apiClient.duplicatePage(page.id, { title: `${title} copy` });
      navigate(`/pages/${duplicated.id}`);
    } catch (duplicateError: unknown) {
      setError(getErrorMessage(duplicateError));
    }
  };
  const deletePage = async () => {
    if (!page) return;
    setError(null);
    try {
      await apiClient.deletePage(page.id);
      navigate("/pages", { replace: true });
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError));
    }
  };
  const exportPage = async (format: "pdf" | "png", settings: Partial<PngExportSettings> = {}) => {
    if (!page) return;
    setError(null);
    setExportJob(null);
    setPendingExportFormat(format);
    try {
      setExportJob(
        await apiClient.createExport({
          ...(settings.dpi === undefined ? {} : { dpi: settings.dpi }),
          format,
          includeBackground: settings.includeBackground ?? true,
          pageId: page.id,
          preset: "print",
        }),
      );
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    } finally {
      setPendingExportFormat(null);
    }
  };

  const submitPngExport = (settings: PngExportSettings) => {
    setIsPngExportSettingsOpen(false);
    void exportPage("png", settings);
  };

  if (status === "loading" || !document || !page) {
    return (
      <>
        <WorkspaceHeader title="Editor" />
        {error ? (
          <p className="panel-alert" role="alert">
            {error}
          </p>
        ) : (
          <p className="empty-state">Loading page</p>
        )}
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader title="Editor">
        <Button
          type="button"
          className="secondary-button"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate("/pages")}
        >
          Back
        </Button>
        <Button
          type="button"
          className="secondary-button"
          icon={<CopyRegular />}
          onClick={duplicatePage}
        >
          Duplicate
        </Button>
        <Button
          type="button"
          className="secondary-button"
          icon={<DeleteRegular />}
          onClick={deletePage}
        >
          Delete
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={pendingExportFormat !== null}
          icon={<ArrowDownloadRegular />}
          onClick={() => setIsPngExportSettingsOpen(true)}
        >
          Export PNG
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={pendingExportFormat !== null}
          icon={<DocumentPdfRegular />}
          onClick={() => exportPage("pdf")}
        >
          Export PDF
        </Button>
        <Button
          appearance="primary"
          type="button"
          className="primary-button"
          disabled={status === "saving"}
          icon={<SaveRegular />}
          onClick={savePage}
        >
          {status === "saving" ? "Saving" : "Save"}
        </Button>
      </WorkspaceHeader>
      {isPngExportSettingsOpen ? (
        <PngExportSettingsModal
          eyebrow={page.title}
          onClose={() => setIsPngExportSettingsOpen(false)}
          onSubmit={submitPngExport}
        />
      ) : null}
      {photoPickerMode ? (
        <PhotoPickerModal
          actionLabel={photoPickerMode.kind === "washiTapePattern" ? "Use as pattern" : "Add"}
          assets={assets}
          eyebrow={page.title}
          title={photoPickerMode.kind === "washiTapePattern" ? "Choose pattern photo" : "Add photo"}
          onAddPhoto={
            photoPickerMode.kind === "washiTapePattern" ? setWashiTapePhotoPattern : addPhoto
          }
          onClose={() => setPhotoPickerMode(null)}
        />
      ) : null}
      {isStickerPickerOpen ? (
        <StickerPickerModal
          eyebrow={page.title}
          onAddSticker={addSticker}
          onClose={() => setIsStickerPickerOpen(false)}
        />
      ) : null}
      {error ? (
        <p className="panel-alert" role="alert">
          {error}
        </p>
      ) : null}
      {pendingExportFormat ? (
        <ProcessingBanner>Preparing {pendingExportFormat.toUpperCase()} export</ProcessingBanner>
      ) : null}
      {exportJob?.outputContentUrl ? (
        <p className="download-banner">
          <a href={exportJob.outputContentUrl} target="_blank" rel="noreferrer">
            Download {exportJob.preset} {exportJob.format.toUpperCase()}
          </a>
        </p>
      ) : null}
      <div className="editor-shell">
        <AssetRail
          assetCount={assets.length}
          onAddEmbellishment={addEmbellishment}
          onAddText={addText}
          onOpenPhotoPicker={() => setPhotoPickerMode({ kind: "photo" })}
          onOpenStickerPicker={() => setIsStickerPickerOpen(true)}
          onOpenWashiTapePicker={addWashiTape}
        />
        <section className="editor-stage" aria-label="Page canvas">
          <EditorToolbar
            document={document}
            status={status}
            title={title}
            onChangeBackground={(backgroundColor) =>
              editDocument(updateCanvas(document, { backgroundColor }))
            }
            onChangeTitle={(nextTitle) => {
              setTitle(nextTitle);
              setStatus("unsaved");
            }}
          />
          <PageCanvas
            assetById={assetById}
            document={document}
            selectedLayerId={selectedLayerId}
            onChangeLayer={updateLayerTransform}
            onDeleteLayer={deleteCanvasLayer}
            onReorderLayer={reorderCanvasLayer}
            onSelectLayer={setSelectedLayerId}
            onChooseWashiTapePhoto={(layerId) =>
              setPhotoPickerMode({ kind: "washiTapePattern", layerId })
            }
            onTransformLayer={updateLayerTransform}
          />
        </section>
      </div>
    </>
  );
}
