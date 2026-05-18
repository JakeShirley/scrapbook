import {
  addLayer,
  createEmbellishmentLayer,
  createPhotoLayer,
  createTextLayer,
  deleteLayer,
  duplicateLayer,
  type EmbellishmentLayer,
  type PageDocument,
  type PageLayer,
  type PhotoLayer,
  renderPageDocumentSvg,
  reorderLayer,
  resetPhotoLayerEdits,
  updateCanvas,
  updateLayer,
} from "@scrapbook/editor-core";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { apiClient } from "../../apiClient";
import { WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { Asset, ExportJob, PageDetail } from "../../types";

type CanvasPoint = { x: number; y: number };
type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type TransformMode = "move" | "resize" | "rotate";
type ActiveTransform = {
  center: CanvasPoint;
  handle: ResizeHandle | undefined;
  layerId: string;
  mode: TransformMode;
  pointerId: number;
  startLayer: PageLayer;
  startPointer: CanvasPoint;
  startPointerAngle: number;
};

const embellishmentPresets: Array<
  Pick<EmbellishmentLayer, "accentColor" | "color" | "element" | "label" | "name">
> = [
  {
    accentColor: "#24766e",
    color: "#d6a537",
    element: "sticker-star",
    label: "",
    name: "Star sticker",
  },
  {
    accentColor: "#d56d46",
    color: "#fffdf7",
    element: "paper-label",
    label: "Memory",
    name: "Paper label",
  },
  {
    accentColor: "#ffffff",
    color: "#79a9a4",
    element: "washi-tape",
    label: "",
    name: "Washi tape",
  },
  {
    accentColor: "#202426",
    color: "#fffdf7",
    element: "photo-corner",
    label: "",
    name: "Photo corner",
  },
  {
    accentColor: "#d6a537",
    color: "#f2d7c9",
    element: "pattern-paper",
    label: "",
    name: "Pattern paper",
  },
];

const resizeHandles: Array<{ handle: ResizeHandle; label: string }> = [
  { handle: "nw", label: "Resize from top left" },
  { handle: "n", label: "Resize from top" },
  { handle: "ne", label: "Resize from top right" },
  { handle: "e", label: "Resize from right" },
  { handle: "se", label: "Resize from bottom right" },
  { handle: "s", label: "Resize from bottom" },
  { handle: "sw", label: "Resize from bottom left" },
  { handle: "w", label: "Resize from left" },
];

const minimumLayerSize = 32;
const rotatePoint = (point: CanvasPoint, degrees: number): CanvasPoint => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
};
const getLayerCenter = (layer: PageLayer): CanvasPoint => ({
  x: layer.x + layer.width / 2,
  y: layer.y + layer.height / 2,
});
const getAngle = (origin: CanvasPoint, point: CanvasPoint): number =>
  (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI;
const normalizeRotation = (degrees: number): number => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;

  return Number.isFinite(normalized) ? normalized : 0;
};

const resizeLayerFromHandle = (
  layer: PageLayer,
  handle: ResizeHandle,
  pointer: CanvasPoint,
  startPointer: CanvasPoint,
): Pick<PageLayer, "height" | "width" | "x" | "y"> => {
  const localDelta = rotatePoint(
    { x: pointer.x - startPointer.x, y: pointer.y - startPointer.y },
    -layer.rotation,
  );
  let left = -layer.width / 2;
  let right = layer.width / 2;
  let top = -layer.height / 2;
  let bottom = layer.height / 2;

  if (handle.includes("w")) left += localDelta.x;
  if (handle.includes("e")) right += localDelta.x;
  if (handle.includes("n")) top += localDelta.y;
  if (handle.includes("s")) bottom += localDelta.y;
  if (right - left < minimumLayerSize) {
    if (handle.includes("w")) left = right - minimumLayerSize;
    else right = left + minimumLayerSize;
  }
  if (bottom - top < minimumLayerSize) {
    if (handle.includes("n")) top = bottom - minimumLayerSize;
    else bottom = top + minimumLayerSize;
  }

  const width = right - left;
  const height = bottom - top;
  const shift = rotatePoint({ x: (left + right) / 2, y: (top + bottom) / 2 }, layer.rotation);
  const startCenter = getLayerCenter(layer);
  const center = { x: startCenter.x + shift.x, y: startCenter.y + shift.y };

  return { height, width, x: center.x - width / 2, y: center.y - height / 2 };
};

export function EditorView() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [document, setDocument] = useState<PageDocument | null>(null);
  const [title, setTitle] = useState("Untitled page");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [status, setStatus] = useState<"loading" | "saved" | "unsaved" | "saving" | "error">(
    "loading",
  );
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
  const addEmbellishment = (
    preset: Pick<EmbellishmentLayer, "accentColor" | "color" | "element" | "label" | "name">,
  ) => {
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
        <aside className="editor-panel editor-asset-rail" aria-label="Assets">
          <div className="panel-heading compact-heading">
            <h3>Assets</h3>
            <span>{assets.length}</span>
          </div>
          <div className="asset-rail-list">
            {assets.length === 0 ? <p className="empty-state">No assets yet</p> : null}
            {assets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className="asset-rail-item"
                onClick={() => addPhoto(asset)}
              >
                <img src={asset.thumbnailUrl ?? asset.originalContentUrl} alt="" />
                <span>{asset.originalFilename}</span>
              </button>
            ))}
          </div>
          <div className="panel-heading compact-heading nested-heading">
            <h3>Elements</h3>
            <span>{embellishmentPresets.length}</span>
          </div>
          <div className="asset-rail-list">
            {embellishmentPresets.map((preset) => (
              <button
                type="button"
                key={preset.element}
                className="element-rail-item"
                onClick={() => addEmbellishment(preset)}
              >
                <span
                  className="element-preview"
                  data-element={preset.element}
                  style={
                    {
                      "--element-accent": preset.accentColor,
                      "--element-color": preset.color,
                    } as CSSProperties
                  }
                />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="editor-stage" aria-label="Page canvas">
          <fieldset className="editor-toolbar">
            <legend className="visually-hidden">Editor tools</legend>
            <label>
              <span>Title</span>
              <input
                value={title}
                maxLength={120}
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                  setStatus("unsaved");
                }}
              />
            </label>
            <label>
              <span>Background</span>
              <input
                type="color"
                value={document.canvas.backgroundColor}
                onChange={(event) =>
                  editDocument(
                    updateCanvas(document, { backgroundColor: event.currentTarget.value }),
                  )
                }
              />
            </label>
            <button type="button" className="secondary-button" onClick={addText}>
              T
            </button>
            <span className={`save-badge ${status}`}>{status}</span>
          </fieldset>
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

function PageCanvas({
  assetById,
  document,
  selectedLayerId,
  onSelectLayer,
  onTransformLayer,
}: {
  assetById: Map<string, Asset>;
  document: PageDocument;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onTransformLayer: (layerId: string, update: Partial<PageLayer>) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const renderedSvg = useMemo(
    () =>
      renderPageDocumentSvg(document, {
        resolvePhotoHref: (layer) =>
          assetById.get(layer.assetId)?.originalContentUrl ??
          assetById.get(layer.assetId)?.thumbnailUrl,
      }),
    [assetById, document],
  );
  const getCanvasPoint = (event: ReactPointerEvent): CanvasPoint | null => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return null;
    const bounds = canvasElement.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * document.canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * document.canvas.height,
    };
  };
  const startTransform = (
    event: ReactPointerEvent<HTMLElement>,
    layer: PageLayer,
    mode: TransformMode,
    handle?: ResizeHandle,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectLayer(layer.id);
    if (layer.locked) return;
    const pointer = getCanvasPoint(event);
    if (!pointer) return;
    const center = getLayerCenter(layer);
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveTransform({
      center,
      handle,
      layerId: layer.id,
      mode,
      pointerId: event.pointerId,
      startLayer: layer,
      startPointer: pointer,
      startPointerAngle: getAngle(center, pointer),
    });
  };
  const transformLayer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeTransform || event.pointerId !== activeTransform.pointerId) return;
    const pointer = getCanvasPoint(event);
    if (!pointer) return;
    event.preventDefault();
    if (activeTransform.mode === "move") {
      onTransformLayer(activeTransform.layerId, {
        x: activeTransform.startLayer.x + pointer.x - activeTransform.startPointer.x,
        y: activeTransform.startLayer.y + pointer.y - activeTransform.startPointer.y,
      });
      return;
    }
    if (activeTransform.mode === "resize" && activeTransform.handle) {
      onTransformLayer(
        activeTransform.layerId,
        resizeLayerFromHandle(
          activeTransform.startLayer,
          activeTransform.handle,
          pointer,
          activeTransform.startPointer,
        ),
      );
      return;
    }
    onTransformLayer(activeTransform.layerId, {
      rotation: normalizeRotation(
        activeTransform.startLayer.rotation +
          getAngle(activeTransform.center, pointer) -
          activeTransform.startPointerAngle,
      ),
    });
  };
  const stopTransform = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTransform?.pointerId === event.pointerId) setActiveTransform(null);
  };

  return (
    <div
      ref={canvasRef}
      className="editor-canvas"
      style={{
        aspectRatio: `${document.canvas.width} / ${document.canvas.height}`,
        background: document.canvas.backgroundColor,
        maxWidth: `min(760px, calc(72vh * ${document.canvas.width / document.canvas.height}))`,
      }}
      onPointerCancel={stopTransform}
      onPointerMove={transformLayer}
      onPointerUp={stopTransform}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Generated from validated page schema and escaped by editor-core. */}
      <div className="editor-render-surface" dangerouslySetInnerHTML={{ __html: renderedSvg }} />
      {document.layers.map((layer) => {
        const isSelected = layer.id === selectedLayerId;
        const layerStyle: CSSProperties = {
          left: `${(layer.x / document.canvas.width) * 100}%`,
          top: `${(layer.y / document.canvas.height) * 100}%`,
          width: `${(layer.width / document.canvas.width) * 100}%`,
          height: `${(layer.height / document.canvas.height) * 100}%`,
          opacity: layer.opacity,
          transform: `rotate(${layer.rotation}deg)`,
        };
        return (
          <div
            key={layer.id}
            className="canvas-layer"
            data-kind={layer.kind}
            data-locked={layer.locked}
            data-selected={isSelected}
            data-transforming={activeTransform?.layerId === layer.id}
            style={layerStyle}
          >
            <button
              type="button"
              aria-label={`${layer.name} ${layer.kind} layer`}
              className="canvas-layer-hitbox"
              onClick={() => onSelectLayer(layer.id)}
              onPointerDown={(event) => startTransform(event, layer, "move")}
            >
              <span className="canvas-layer-content" />
            </button>
            {isSelected && !layer.locked ? (
              <>
                <button
                  type="button"
                  aria-label="Rotate layer"
                  className="transform-rotate-handle"
                  title="Rotate"
                  onPointerDown={(event) => startTransform(event, layer, "rotate")}
                />
                {resizeHandles.map(({ handle, label }) => (
                  <button
                    type="button"
                    aria-label={label}
                    className="transform-resize-handle"
                    data-handle={handle}
                    key={handle}
                    title={label}
                    onPointerDown={(event) => startTransform(event, layer, "resize", handle)}
                  />
                ))}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LayerList({
  document,
  selectedLayerId,
  onSelectLayer,
  onChange,
}: {
  document: PageDocument;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onChange: (document: PageDocument) => void;
}) {
  return (
    <ol className="layer-list">
      {document.layers.map((layer, layerIndex) => (
        <li key={layer.id} data-selected={layer.id === selectedLayerId}>
          <button type="button" className="layer-select" onClick={() => onSelectLayer(layer.id)}>
            <span>{layer.name}</span>
            <span>{layer.kind}</span>
          </button>
          <div className="layer-actions">
            <button
              type="button"
              disabled={layerIndex === 0}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex - 1))}
            >
              Up
            </button>
            <button
              type="button"
              disabled={layerIndex === document.layers.length - 1}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex + 1))}
            >
              Down
            </button>
            <button type="button" onClick={() => onChange(duplicateLayer(document, layer.id))}>
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(deleteLayer(document, layer.id));
                onSelectLayer(null);
              }}
            >
              Del
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LayerInspector({
  layer,
  onChange,
}: {
  layer: PageLayer | null;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  if (!layer) return <p className="empty-state">Select a layer to edit it.</p>;
  const updateNumber =
    (key: "height" | "opacity" | "rotation" | "width" | "x" | "y") =>
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange({ [key]: Number(event.currentTarget.value) } as Partial<PageLayer>);
  const updatePhotoLayer = (update: Partial<PhotoLayer>) => onChange(update as Partial<PageLayer>);

  return (
    <form className="inspector-form">
      <label>
        <span>Name</span>
        <input
          value={layer.name}
          maxLength={120}
          onChange={(event) => onChange({ name: event.currentTarget.value })}
        />
      </label>
      <div className="inspector-grid">
        <label>
          <span>X</span>
          <input type="number" value={layer.x} onChange={updateNumber("x")} />
        </label>
        <label>
          <span>Y</span>
          <input type="number" value={layer.y} onChange={updateNumber("y")} />
        </label>
        <label>
          <span>W</span>
          <input min={1} type="number" value={layer.width} onChange={updateNumber("width")} />
        </label>
        <label>
          <span>H</span>
          <input min={1} type="number" value={layer.height} onChange={updateNumber("height")} />
        </label>
      </div>
      <label>
        <span>Rotation</span>
        <input type="number" value={layer.rotation} onChange={updateNumber("rotation")} />
      </label>
      <label>
        <span>Opacity</span>
        <input
          max={1}
          min={0}
          step={0.05}
          type="range"
          value={layer.opacity}
          onChange={updateNumber("opacity")}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={layer.locked}
          onChange={(event) => onChange({ locked: event.currentTarget.checked })}
        />
        <span>Locked</span>
      </label>
      {layer.kind === "text" ? <TextControls layer={layer} onChange={onChange} /> : null}
      {layer.kind === "photo" ? <PhotoControls layer={layer} onChange={updatePhotoLayer} /> : null}
      {layer.kind === "embellishment" ? (
        <EmbellishmentControls layer={layer} onChange={onChange} />
      ) : null}
    </form>
  );
}

function TextControls({
  layer,
  onChange,
}: {
  layer: Extract<PageLayer, { kind: "text" }>;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  return (
    <>
      <label>
        <span>Text</span>
        <textarea
          value={layer.text}
          onChange={(event) => onChange({ text: event.currentTarget.value } as Partial<PageLayer>)}
        />
      </label>
      <label>
        <span>Font size</span>
        <input
          max={240}
          min={6}
          type="number"
          value={layer.fontSize}
          onChange={(event) =>
            onChange({ fontSize: Number(event.currentTarget.value) } as Partial<PageLayer>)
          }
        />
      </label>
      <label>
        <span>Color</span>
        <input
          type="color"
          value={layer.color}
          onChange={(event) => onChange({ color: event.currentTarget.value } as Partial<PageLayer>)}
        />
      </label>
      <label>
        <span>Align</span>
        <select
          value={layer.align}
          onChange={(event) => onChange({ align: event.currentTarget.value } as Partial<PageLayer>)}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
    </>
  );
}

function PhotoControls({
  layer,
  onChange,
}: {
  layer: PhotoLayer;
  onChange: (update: Partial<PhotoLayer>) => void;
}) {
  const updatePhotoTransform = (update: Partial<PhotoLayer["photoTransform"]>) =>
    onChange({ photoTransform: { ...layer.photoTransform, ...update } });
  const updateCrop = (update: Partial<PhotoLayer["crop"]>) =>
    onChange({ crop: { ...layer.crop, ...update } });
  const updateBorder = (update: Partial<PhotoLayer["border"]>) =>
    onChange({ border: { ...layer.border, ...update } });
  const updateMask = (update: Partial<PhotoLayer["mask"]>) =>
    onChange({ mask: { ...layer.mask, ...update } });
  const updateFilter = (update: Partial<PhotoLayer["filter"]>) =>
    onChange({ filter: { ...layer.filter, ...update } });

  return (
    <>
      <fieldset className="inspector-section">
        <legend>Photo</legend>
        <label>
          <span>Fit</span>
          <select
            value={layer.fit}
            onChange={(event) => onChange({ fit: event.currentTarget.value as PhotoLayer["fit"] })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
        </label>
        <label>
          <span>Filter</span>
          <select
            value={layer.filter.preset}
            onChange={(event) =>
              updateFilter({ preset: event.currentTarget.value as PhotoLayer["filter"]["preset"] })
            }
          >
            <option value="none">None</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
            <option value="mono">Mono</option>
            <option value="fade">Fade</option>
            <option value="sepia">Sepia</option>
          </select>
        </label>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Transform</legend>
        <label>
          <span>Scale</span>
          <input
            max={5}
            min={0.1}
            step={0.05}
            type="range"
            value={layer.photoTransform.scale}
            onChange={(event) => updatePhotoTransform({ scale: Number(event.currentTarget.value) })}
          />
        </label>
        <div className="inspector-grid">
          <label>
            <span>Offset X</span>
            <input
              max={1}
              min={-1}
              step={0.01}
              type="number"
              value={layer.photoTransform.offsetX}
              onChange={(event) =>
                updatePhotoTransform({ offsetX: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            <span>Offset Y</span>
            <input
              max={1}
              min={-1}
              step={0.01}
              type="number"
              value={layer.photoTransform.offsetY}
              onChange={(event) =>
                updatePhotoTransform({ offsetY: Number(event.currentTarget.value) })
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Crop</legend>
        <div className="inspector-grid">
          <label>
            <span>Crop X</span>
            <input
              max={1 - layer.crop.width}
              min={0}
              step={0.01}
              type="number"
              value={layer.crop.x}
              onChange={(event) => updateCrop({ x: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>Crop Y</span>
            <input
              max={1 - layer.crop.height}
              min={0}
              step={0.01}
              type="number"
              value={layer.crop.y}
              onChange={(event) => updateCrop({ y: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>Crop W</span>
            <input
              max={1 - layer.crop.x}
              min={0.05}
              step={0.01}
              type="number"
              value={layer.crop.width}
              onChange={(event) => updateCrop({ width: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>Crop H</span>
            <input
              max={1 - layer.crop.y}
              min={0.05}
              step={0.01}
              type="number"
              value={layer.crop.height}
              onChange={(event) => updateCrop({ height: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Frame</legend>
        <div className="inspector-grid">
          <label>
            <span>Frame</span>
            <select
              value={layer.border.framePreset}
              onChange={(event) =>
                updateBorder({
                  framePreset: event.currentTarget.value as PhotoLayer["border"]["framePreset"],
                })
              }
            >
              <option value="none">None</option>
              <option value="mat">Mat</option>
              <option value="polaroid">Polaroid</option>
              <option value="film">Film</option>
              <option value="paper">Paper</option>
            </select>
          </label>
          <label>
            <span>Border</span>
            <input
              max={160}
              min={0}
              type="number"
              value={layer.border.width}
              onChange={(event) => updateBorder({ width: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
        <label>
          <span>Border color</span>
          <input
            type="color"
            value={layer.border.color}
            onChange={(event) => updateBorder({ color: event.currentTarget.value })}
          />
        </label>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Mask</legend>
        <label>
          <span>Shape</span>
          <select
            value={layer.mask.shape}
            onChange={(event) =>
              updateMask({ shape: event.currentTarget.value as PhotoLayer["mask"]["shape"] })
            }
          >
            <option value="rectangle">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="arch">Arch</option>
            <option value="diamond">Diamond</option>
            <option value="ticket">Ticket</option>
          </select>
        </label>
      </fieldset>
      <button
        type="button"
        className="secondary-button full-width-button"
        onClick={() => onChange(resetPhotoLayerEdits(layer))}
      >
        Reset photo edits
      </button>
    </>
  );
}

function EmbellishmentControls({
  layer,
  onChange,
}: {
  layer: Extract<PageLayer, { kind: "embellishment" }>;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  return (
    <>
      <label>
        <span>Label</span>
        <input
          maxLength={80}
          value={layer.label}
          onChange={(event) => onChange({ label: event.currentTarget.value } as Partial<PageLayer>)}
        />
      </label>
      <div className="inspector-grid">
        <label>
          <span>Color</span>
          <input
            type="color"
            value={layer.color}
            onChange={(event) =>
              onChange({ color: event.currentTarget.value } as Partial<PageLayer>)
            }
          />
        </label>
        <label>
          <span>Accent</span>
          <input
            type="color"
            value={layer.accentColor}
            onChange={(event) =>
              onChange({ accentColor: event.currentTarget.value } as Partial<PageLayer>)
            }
          />
        </label>
      </div>
    </>
  );
}
