import {
  addLayer,
  createEmbellishmentLayer,
  createPhotoLayer,
  createTextLayer,
  type PageDocument,
  type PageLayer,
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
import { LayerInspector } from "./LayerInspector";
import { LayerList } from "./LayerList";
import { PageCanvas } from "./PageCanvas";

export function EditorView() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [document, setDocument] = useState<PageDocument | null>(null);
  const [title, setTitle] = useState("Untitled page");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
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
  const selectedLayer = useMemo(
    () => document?.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [document, selectedLayerId],
  );
  const editDocument = (nextDocument: PageDocument) => {
    setDocument(nextDocument);
    setStatus("unsaved");
  };
  const updateSelectedLayer = (update: Partial<PageLayer>) => {
    if (document && selectedLayerId) editDocument(updateLayer(document, selectedLayerId, update));
  };
  const updateLayerTransform = (layerId: string, update: Partial<PageLayer>) => {
    if (document) editDocument(updateLayer(document, layerId, update));
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
  const exportPage = async (format: "pdf" | "png") => {
    if (!page) return;
    setError(null);
    try {
      setExportJob(await apiClient.createExport({ format, pageId: page.id, preset: "print" }));
    } catch (exportError: unknown) {
      setError(getErrorMessage(exportError));
    }
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
        <button type="button" className="secondary-button" onClick={() => navigate("/pages")}>
          Back
        </button>
        <button type="button" className="secondary-button" onClick={duplicatePage}>
          Duplicate
        </button>
        <button type="button" className="secondary-button" onClick={deletePage}>
          Delete
        </button>
        <button type="button" className="secondary-button" onClick={() => exportPage("png")}>
          Export PNG
        </button>
        <button type="button" className="secondary-button" onClick={() => exportPage("pdf")}>
          Export PDF
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={status === "saving"}
          onClick={savePage}
        >
          {status === "saving" ? "Saving" : "Save"}
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
            Download {exportJob.preset} {exportJob.format.toUpperCase()}
          </a>
        </p>
      ) : null}
      <div className="editor-shell">
        <AssetRail assets={assets} onAddEmbellishment={addEmbellishment} onAddPhoto={addPhoto} />
        <section className="editor-stage" aria-label="Page canvas">
          <EditorToolbar
            document={document}
            status={status}
            title={title}
            onAddText={addText}
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
            onSelectLayer={setSelectedLayerId}
            onTransformLayer={updateLayerTransform}
          />
        </section>
        <aside className="editor-panel" aria-label="Layer controls">
          <div className="panel-heading compact-heading">
            <h3>Layers</h3>
            <span>{document.layers.length}</span>
          </div>
          <LayerList
            document={document}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onChange={editDocument}
          />
          <LayerInspector layer={selectedLayer} onChange={updateSelectedLayer} />
        </aside>
      </div>
    </>
  );
}
