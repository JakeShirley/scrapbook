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
  createTextLayer,
  deleteLayer,
  type PageDocument,
  type PageLayer,
  reorderLayer,
  updateCanvas,
  updateLayer,
} from "@scrapbook/editor-core";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { apiClient } from "../../apiClient";
import { WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { Asset, ExportJob, PageDetail } from "../../types";
import { AssetRail } from "./AssetRail";
import { EditorToolbar } from "./EditorToolbar";
import type { EditorSaveStatus } from "./editorTypes";
import type { EmbellishmentPreset } from "./embellishments";
import { PageCanvas } from "./PageCanvas";
import { PhotoPickerModal } from "./PhotoPickerModal";
import { PngExportSettingsModal } from "./PngExportSettingsModal";

export function EditorView() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [document, setDocument] = useState<PageDocument | null>(null);
  const [title, setTitle] = useState("Untitled page");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false);
  const [isPngExportSettingsOpen, setIsPngExportSettingsOpen] = useState(false);
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
          setSelectedLayerId(loadedPage.document.layers[0]?.id ?? null);
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
    const layer = createTextLayer({ text: "New text", name: "Text" });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };
  const addPhoto = (asset: Asset) => {
    if (!document) return;
    const layer = createPhotoLayer({
      assetId: asset.id,
      name: asset.originalFilename,
      width: Math.min(document.canvas.width * 0.5, 1000),
      height: Math.min(document.canvas.height * 0.34, 760),
    });
    editDocument(addLayer(document, layer));
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
  const exportPage = async (format: "pdf" | "png", dpi?: number) => {
    if (!page) return;
    setError(null);
    try {
      setExportJob(
        await apiClient.createExport({
          ...(dpi === undefined ? {} : { dpi }),
          format,
          pageId: page.id,
          preset: "print",
        }),
      );
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    }
  };

  const submitPngExport = (dpi: number) => {
    setIsPngExportSettingsOpen(false);
    void exportPage("png", dpi);
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
          icon={<ArrowDownloadRegular />}
          onClick={() => setIsPngExportSettingsOpen(true)}
        >
          Export PNG
        </Button>
        <Button
          type="button"
          className="secondary-button"
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
      {isPhotoPickerOpen ? (
        <PhotoPickerModal
          assets={assets}
          eyebrow={page.title}
          onAddPhoto={addPhoto}
          onClose={() => setIsPhotoPickerOpen(false)}
        />
      ) : null}
      {error ? (
        <p className="panel-alert" role="alert">
          {error}
        </p>
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
          onOpenPhotoPicker={() => setIsPhotoPickerOpen(true)}
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
            onDeleteLayer={deleteCanvasLayer}
            onReorderLayer={reorderCanvasLayer}
            onSelectLayer={setSelectedLayerId}
            onTransformLayer={updateLayerTransform}
          />
        </section>
      </div>
    </>
  );
}
