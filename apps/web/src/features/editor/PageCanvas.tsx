import {
  ArrowClockwiseRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  ImageBorderRegular,
} from "@fluentui/react-icons";
import {
  type PageDocument,
  type PageLayer,
  type PhotoLayer,
  renderPageDocumentSvg,
  type StickerSvg,
  type WashiTapeLayer,
} from "@scrapbook/editor-core";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Asset } from "../../types";
import type { ActiveTransform, CanvasPoint, ResizeHandle, TransformMode } from "./editorTypes";
import { FontFamilySelect } from "./FontFamilySelect";
import { LayerInspector } from "./LayerInspector";
import { TextAlignmentControl } from "./TextAlignmentControl";
import {
  getAngle,
  getLayerCenter,
  getLayerSelectionFrame,
  normalizeRotation,
  resizeHandles,
  resizeLayerFromHandle,
} from "./transforms";

type SelectionPanel = "edit" | "frame";

export type CanvasPreviewLayer = {
  layer: PageLayer;
  sourcePageId: string;
  stackIndex: number;
};

type InteractiveCanvasLayer =
  | {
      kind: "document";
      layer: PageLayer;
      stackIndex: number;
    }
  | {
      kind: "preview";
      layer: PageLayer;
      sourcePageId: string;
      stackIndex: number;
    };

const mergeCanvasLayers = (
  layers: PageLayer[],
  previewLayers: CanvasPreviewLayer[],
): InteractiveCanvasLayer[] =>
  [
    ...layers.map((layer, stackIndex) => ({ kind: "document" as const, layer, stackIndex })),
    ...previewLayers.map(({ layer, sourcePageId, stackIndex }) => ({
      kind: "preview" as const,
      layer,
      sourcePageId,
      stackIndex,
    })),
  ].sort((left, right) => left.stackIndex - right.stackIndex);

const applyLayerUpdate = (layer: PageLayer, update: Partial<PageLayer>): PageLayer =>
  ({ ...layer, ...update }) as PageLayer;

const layerRotationTransform = (layer: PageLayer): string => {
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;

  return `rotate(${layer.rotation} ${centerX} ${centerY})`;
};

const framePresetOptions: PhotoLayer["border"]["framePreset"][] = [
  "none",
  "mat",
  "polaroid",
  "film",
  "paper",
];

const maskShapeOptions: PhotoLayer["mask"]["shape"][] = [
  "rectangle",
  "ellipse",
  "arch",
  "diamond",
  "ticket",
];

const formatFramePreset = (preset: PhotoLayer["border"]["framePreset"]) =>
  preset === "none" ? "None" : preset.charAt(0).toUpperCase() + preset.slice(1);

const formatMaskShape = (shape: PhotoLayer["mask"]["shape"]) =>
  shape.charAt(0).toUpperCase() + shape.slice(1);

const formatLayerKind = (kind: PageLayer["kind"]): string =>
  kind === "photo"
    ? "Photo"
    : kind === "text"
      ? "Text"
      : kind === "sticker"
        ? "Sticker"
        : kind === "washiTape"
          ? "Washi tape"
          : "Embellishment";

const nativeBrowserImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const resolveBrowserPreviewHref = (asset: Asset): string | undefined =>
  asset.variants.find(
    (variant) => variant.kind === "preview" && nativeBrowserImageMimeTypes.has(variant.mimeType),
  )?.contentUrl;

const resolveBrowserPhotoHref = (asset: Asset | undefined): string | undefined => {
  if (!asset) {
    return undefined;
  }

  const previewHref = resolveBrowserPreviewHref(asset);

  return nativeBrowserImageMimeTypes.has(asset.mimeType)
    ? (asset.originalContentUrl ?? previewHref ?? asset.thumbnailUrl)
    : (previewHref ?? asset.thumbnailUrl ?? asset.originalContentUrl);
};

const resolveBrowserWashiTapeHref = (
  assetById: Map<string, Asset>,
  layer: WashiTapeLayer,
): string | undefined =>
  resolveBrowserPhotoHref(
    assetById.get(
      layer.pattern.kind === "customPhoto" ? (layer.pattern.assetId ?? layer.assetId ?? "") : "",
    ),
  );

export function PageCanvas({
  assetById,
  document,
  previewLayers = [],
  selectedLayerId,
  onDeleteLayer,
  onChangeLayer,
  onReorderLayer,
  onSelectPreviewLayer,
  onSelectLayer,
  onChooseWashiTapePhoto,
  onTransformEnd,
  onTransformLayer,
}: {
  assetById: Map<string, Asset>;
  document: PageDocument;
  previewLayers?: CanvasPreviewLayer[];
  selectedLayerId: string | null;
  onDeleteLayer: (layerId: string) => void;
  onChangeLayer?: (layerId: string, update: Partial<PageLayer>) => void;
  onReorderLayer: (layerId: string, toIndex: number) => void;
  onSelectPreviewLayer?: (pageId: string, layerId: string) => void;
  onSelectLayer: (layerId: string | null) => void;
  onChooseWashiTapePhoto?: ((layerId: string) => void) | undefined;
  onTransformEnd?: (layerId: string, update: Partial<PageLayer> | null) => void;
  onTransformLayer: (layerId: string, update: Partial<PageLayer>) => void;
}) {
  const svgIdPrefix = useId();
  const canvasRef = useRef<HTMLFieldSetElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renderSurfaceRef = useRef<HTMLDivElement>(null);
  const textTransformPreviewRef = useRef<{
    group: SVGGElement;
    localGroup: SVGGElement;
    localTransform: string | null;
    outerTransform: string | null;
  } | null>(null);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const [activeTransformUpdate, setActiveTransformUpdate] = useState<Partial<PageLayer> | null>(
    null,
  );
  const [activeSelectionPanel, setActiveSelectionPanel] = useState<SelectionPanel | null>(null);
  const [contextMenu, setContextMenu] = useState<{ layerId: string; x: number; y: number } | null>(
    null,
  );
  const [stickerSvgById, setStickerSvgById] = useState<Map<string, StickerSvg>>(new Map());
  const interactiveLayers = useMemo<InteractiveCanvasLayer[]>(
    () => mergeCanvasLayers(document.layers, previewLayers),
    [document.layers, previewLayers],
  );
  const stickerIds = useMemo(
    () => [
      ...new Set(
        interactiveLayers.flatMap(({ layer }) =>
          layer.kind === "sticker" ? [layer.stickerId] : [],
        ),
      ),
    ],
    [interactiveLayers],
  );
  const renderedDocument = useMemo(
    () => ({ ...document, layers: interactiveLayers.map(({ layer }) => layer) }),
    [document, interactiveLayers],
  );
  const displayedInteractiveLayers = useMemo<InteractiveCanvasLayer[]>(() => {
    if (!activeTransformUpdate || !activeTransform) {
      return interactiveLayers;
    }

    return interactiveLayers.map((interactiveLayer) =>
      interactiveLayer.kind === "document" && interactiveLayer.layer.id === activeTransform.layerId
        ? {
            ...interactiveLayer,
            layer: applyLayerUpdate(interactiveLayer.layer, activeTransformUpdate),
          }
        : interactiveLayer,
    );
  }, [activeTransform, activeTransformUpdate, interactiveLayers]);
  const renderedSvg = useMemo(
    () =>
      renderPageDocumentSvg(renderedDocument, {
        idPrefix: svgIdPrefix,
        resolvePhotoHref: (layer) => resolveBrowserPhotoHref(assetById.get(layer.assetId)),
        resolveStickerSvg: (layer) => stickerSvgById.get(layer.stickerId),
        resolveWashiTapeHref: (layer) => resolveBrowserWashiTapeHref(assetById, layer),
      }),
    [assetById, renderedDocument, stickerSvgById, svgIdPrefix],
  );
  const contextLayerIndex = contextMenu
    ? document.layers.findIndex((layer) => layer.id === contextMenu.layerId)
    : -1;
  const contextLayer = contextLayerIndex >= 0 ? document.layers[contextLayerIndex] : null;
  const selectedLayer =
    displayedInteractiveLayers.find(
      (interactiveLayer) =>
        interactiveLayer.kind === "document" && interactiveLayer.layer.id === selectedLayerId,
    )?.layer ?? null;
  const selectedLayerLabel = selectedLayer ? `${formatLayerKind(selectedLayer.kind)} layer` : null;
  const contextLayerLabel = contextLayer ? `${formatLayerKind(contextLayer.kind)} layer` : null;
  const selectedSelectionFrame = selectedLayer ? getLayerSelectionFrame(selectedLayer) : null;
  const selectedLayerMenuPlacement =
    selectedSelectionFrame && selectedSelectionFrame.y > document.canvas.height * 0.16
      ? "above"
      : "below";
  const selectedLayerMenuHalfWidth = selectedLayer
    ? selectedLayer.kind === "text"
      ? 208
      : selectedLayer.kind === "photo"
        ? 100
        : 68
    : 68;
  const selectedLayerMenuStyle: CSSProperties | undefined = selectedSelectionFrame
    ? {
        left: `clamp(${selectedLayerMenuHalfWidth + 8}px, ${
          ((selectedSelectionFrame.x + selectedSelectionFrame.width / 2) / document.canvas.width) *
          100
        }%, calc(100% - ${selectedLayerMenuHalfWidth + 8}px))`,
        top: `${
          ((selectedLayerMenuPlacement === "above"
            ? selectedSelectionFrame.y
            : selectedSelectionFrame.y + selectedSelectionFrame.height) /
            document.canvas.height) *
          100
        }%`,
      }
    : undefined;
  const closeContextMenu = () => setContextMenu(null);
  const changeLayer = (layerId: string, update: Partial<PageLayer>) =>
    (onChangeLayer ?? onTransformLayer)(layerId, update);
  const restoreTextTransformPreview = useCallback(() => {
    const preview = textTransformPreviewRef.current;

    if (!preview) return;

    if (preview.outerTransform === null) {
      preview.group.removeAttribute("transform");
    } else {
      preview.group.setAttribute("transform", preview.outerTransform);
    }

    if (preview.localTransform === null) {
      preview.localGroup.removeAttribute("transform");
    } else {
      preview.localGroup.setAttribute("transform", preview.localTransform);
    }

    textTransformPreviewRef.current = null;
  }, []);

  useEffect(() => {
    const missingStickerIds = stickerIds.filter((stickerId) => !stickerSvgById.has(stickerId));

    if (missingStickerIds.length === 0) {
      return;
    }

    let isCancelled = false;

    import("@scrapbook/editor-core/stickers").then(({ getStickerSvg }) => {
      if (isCancelled) {
        return;
      }

      setStickerSvgById((currentStickerSvgs) => {
        const nextStickerSvgs = new Map(currentStickerSvgs);

        for (const stickerId of missingStickerIds) {
          const stickerSvg = getStickerSvg(stickerId);

          if (stickerSvg) {
            nextStickerSvgs.set(stickerId, stickerSvg);
          }
        }

        return nextStickerSvgs;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [stickerIds, stickerSvgById]);

  useEffect(() => {
    if (!selectedLayerId) setActiveSelectionPanel(null);
  }, [selectedLayerId]);

  useEffect(() => {
    if (activeTransform) setActiveSelectionPanel(null);
  }, [activeTransform]);

  useLayoutEffect(() => {
    if (
      !activeTransform ||
      activeTransform.mode !== "move" ||
      activeTransform.startLayer.kind !== "text"
    ) {
      restoreTextTransformPreview();
      return;
    }

    const group = [
      ...(renderSurfaceRef.current?.querySelectorAll<SVGGElement>("[data-layer-id]") ?? []),
    ].find((candidateGroup) => candidateGroup.dataset.layerId === activeTransform.layerId);
    const localGroup = group?.querySelector<SVGGElement>('[data-layer-local-transform="true"]');

    if (!group || !localGroup) {
      return;
    }

    const currentPreview = textTransformPreviewRef.current;

    if (
      !currentPreview ||
      currentPreview.group !== group ||
      currentPreview.localGroup !== localGroup
    ) {
      restoreTextTransformPreview();
      textTransformPreviewRef.current = {
        group,
        localGroup,
        localTransform: localGroup.getAttribute("transform"),
        outerTransform: group.getAttribute("transform"),
      };
    }

    const previewLayer = activeTransformUpdate
      ? applyLayerUpdate(activeTransform.startLayer, activeTransformUpdate)
      : activeTransform.startLayer;

    group.setAttribute("transform", layerRotationTransform(previewLayer));
    localGroup.setAttribute("transform", `translate(${previewLayer.x} ${previewLayer.y})`);
  }, [activeTransform, activeTransformUpdate, restoreTextTransformPreview]);

  useLayoutEffect(() => () => restoreTextTransformPreview(), [restoreTextTransformPreview]);

  useEffect(() => {
    if (!activeSelectionPanel) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveSelectionPanel(null);
    };

    globalThis.document.addEventListener("keydown", closeOnEscape);

    return () => {
      globalThis.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeSelectionPanel]);
  useEffect(() => {
    if (!contextMenu) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    const closeOnViewportChange = () => setContextMenu(null);

    globalThis.document.addEventListener("pointerdown", closeOnPointerDown);
    globalThis.document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);

    return () => {
      globalThis.document.removeEventListener("pointerdown", closeOnPointerDown);
      globalThis.document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [contextMenu]);
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
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    onSelectLayer(layer.id);
    if (layer.locked) return;
    const pointer = getCanvasPoint(event);
    if (!pointer) return;
    const center = getLayerCenter(layer);
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveTransformUpdate(null);
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
  const getTransformUpdate = (
    transform: ActiveTransform,
    pointer: CanvasPoint,
  ): Partial<PageLayer> => {
    if (transform.mode === "move") {
      return {
        x: transform.startLayer.x + pointer.x - transform.startPointer.x,
        y: transform.startLayer.y + pointer.y - transform.startPointer.y,
      };
    }
    if (transform.mode === "resize" && transform.handle) {
      return resizeLayerFromHandle(
        transform.startLayer,
        transform.handle,
        pointer,
        transform.startPointer,
      );
    }

    return {
      rotation: normalizeRotation(
        transform.startLayer.rotation +
          getAngle(transform.center, pointer) -
          transform.startPointerAngle,
      ),
    };
  };
  const transformLayer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!activeTransform || event.pointerId !== activeTransform.pointerId) return;
    const pointer = getCanvasPoint(event);
    if (!pointer) return;
    event.preventDefault();
    const update = getTransformUpdate(activeTransform, pointer);

    if (activeTransform.mode === "move" && activeTransform.startLayer.kind === "text") {
      setActiveTransformUpdate(update);
      return;
    }

    onTransformLayer(activeTransform.layerId, update);
  };
  const stopTransform = (event: ReactPointerEvent<HTMLElement>) => {
    if (activeTransform?.pointerId !== event.pointerId) return;
    const transform = activeTransform;
    const pointer = getCanvasPoint(event);
    const update = pointer ? getTransformUpdate(transform, pointer) : null;

    setActiveTransform(null);
    setActiveTransformUpdate(null);

    if (onTransformEnd) {
      onTransformEnd(transform.layerId, update);
      return;
    }

    if (update) {
      onTransformLayer(transform.layerId, update);
    }
  };
  const openContextMenu = (event: ReactMouseEvent, layer: PageLayer) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveTransform(null);
    onSelectLayer(layer.id);

    const menuWidth = 204;
    const menuHeight = 226;
    const margin = 8;
    setContextMenu({
      layerId: layer.id,
      x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
      y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
    });
  };
  const selectPreviewLayer = (
    event: ReactPointerEvent<HTMLElement>,
    previewLayer: CanvasPreviewLayer,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    setActiveSelectionPanel(null);
    onSelectPreviewLayer?.(previewLayer.sourcePageId, previewLayer.layer.id);
  };
  const runContextAction = (action: () => void) => {
    action();
    closeContextMenu();
  };
  const toggleSelectionPanel = (panel: SelectionPanel) => {
    closeContextMenu();
    setActiveSelectionPanel((currentPanel) => (currentPanel === panel ? null : panel));
  };
  const openSelectionPanel = (panel: SelectionPanel) => {
    closeContextMenu();
    setActiveSelectionPanel(panel);
  };
  const openLayerEditor = (event: ReactMouseEvent, layer: PageLayer) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveTransform(null);
    closeContextMenu();
    onSelectLayer(layer.id);
    setActiveSelectionPanel("edit");
  };
  const updateSelectedPhotoBorder = (update: Partial<PhotoLayer["border"]>) => {
    if (!selectedLayer || selectedLayer.kind !== "photo") return;

    changeLayer(selectedLayer.id, {
      border: { ...selectedLayer.border, ...update },
    } as Partial<PageLayer>);
  };
  const updateSelectedPhotoMask = (update: Partial<PhotoLayer["mask"]>) => {
    if (!selectedLayer || selectedLayer.kind !== "photo") return;

    changeLayer(selectedLayer.id, {
      mask: { ...selectedLayer.mask, ...update },
    } as Partial<PageLayer>);
  };
  const clearSelection = (event: ReactPointerEvent<HTMLFieldSetElement>) => {
    if (event.button !== 0 || activeTransform) return;
    if (contextMenuRef.current?.contains(event.target as Node)) return;
    closeContextMenu();
    setActiveSelectionPanel(null);
    onSelectLayer(null);
  };

  return (
    <fieldset
      ref={canvasRef}
      className="editor-canvas"
      style={{
        aspectRatio: `${document.canvas.width} / ${document.canvas.height}`,
        background: document.canvas.backgroundColor,
        maxWidth: `min(760px, calc(72vh * ${document.canvas.width / document.canvas.height}))`,
      }}
      onPointerCancel={stopTransform}
      onPointerDown={clearSelection}
      onPointerMove={transformLayer}
      onPointerUp={stopTransform}
      onContextMenu={(event) => {
        event.preventDefault();
        closeContextMenu();
      }}
    >
      <legend className="visually-hidden">Editable page canvas</legend>
      <div
        className="editor-render-surface"
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: Generated from validated page schema and escaped by editor-core. */
        dangerouslySetInnerHTML={{ __html: renderedSvg }}
        ref={renderSurfaceRef}
      />
      {displayedInteractiveLayers.map((interactiveLayer, layerIndex) => {
        const { layer } = interactiveLayer;
        const isPreview = interactiveLayer.kind === "preview";
        const isSelected = !isPreview && layer.id === selectedLayerId;
        const layerStyle: CSSProperties = {
          left: `${(layer.x / document.canvas.width) * 100}%`,
          top: `${(layer.y / document.canvas.height) * 100}%`,
          width: `${(layer.width / document.canvas.width) * 100}%`,
          height: `${(layer.height / document.canvas.height) * 100}%`,
          zIndex: layerIndex + 1,
          opacity: layer.opacity,
          transform: `rotate(${layer.rotation}deg)`,
        };
        const selectionFrame = getLayerSelectionFrame(layer);
        const selectionFrameStyle: CSSProperties = {
          left: `${((selectionFrame.x - layer.x) / layer.width) * 100}%`,
          top: `${((selectionFrame.y - layer.y) / layer.height) * 100}%`,
          width: `${(selectionFrame.width / layer.width) * 100}%`,
          height: `${(selectionFrame.height / layer.height) * 100}%`,
          transform: `rotate(${selectionFrame.rotation}deg)`,
        };
        const layerLabel = `${formatLayerKind(layer.kind)} layer`;
        return (
          <div
            key={isPreview ? `${interactiveLayer.sourcePageId}:${layer.id}` : layer.id}
            className="canvas-layer"
            data-kind={layer.kind}
            data-locked={layer.locked}
            data-preview={isPreview}
            data-selected={isSelected}
            data-transforming={activeTransform?.layerId === layer.id}
            style={layerStyle}
          >
            <button
              type="button"
              aria-label={`${layerLabel}${isPreview ? " from adjacent page" : ""}`}
              className="canvas-layer-hitbox"
              onClick={() => {
                if (interactiveLayer.kind === "preview") {
                  onSelectPreviewLayer?.(interactiveLayer.sourcePageId, layer.id);
                  return;
                }

                onSelectLayer(layer.id);
              }}
              onContextMenu={(event) => {
                if (interactiveLayer.kind === "preview") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeContextMenu();
                  onSelectPreviewLayer?.(interactiveLayer.sourcePageId, layer.id);
                  return;
                }

                openContextMenu(event, layer);
              }}
              onDoubleClick={(event) => {
                if (interactiveLayer.kind === "preview") return;
                openLayerEditor(event, layer);
              }}
              onPointerDown={(event) => {
                if (interactiveLayer.kind === "preview") {
                  selectPreviewLayer(event, interactiveLayer);
                  return;
                }

                startTransform(event, layer, "move");
              }}
            />
            <div className="canvas-selection-frame" style={selectionFrameStyle}>
              <span className="canvas-layer-content" />
              {isSelected && !layer.locked ? (
                <>
                  <button
                    type="button"
                    aria-label="Rotate layer"
                    className="transform-rotate-handle"
                    title="Rotate"
                    onPointerDown={(event) => startTransform(event, layer, "rotate")}
                  >
                    <ArrowClockwiseRegular />
                  </button>
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
          </div>
        );
      })}
      {selectedLayer && selectedLayerMenuStyle && !activeTransform ? (
        <div
          className="selected-layer-tools"
          data-placement={selectedLayerMenuPlacement}
          style={selectedLayerMenuStyle}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            aria-label={`${selectedLayerLabel} actions`}
            className="selected-layer-action-bar"
            role="toolbar"
          >
            <button
              type="button"
              aria-label="Edit layer"
              aria-pressed={activeSelectionPanel === "edit"}
              title="Edit"
              onClick={() => toggleSelectionPanel("edit")}
            >
              <EditRegular />
              <span>Edit</span>
            </button>
            {selectedLayer.kind === "photo" ? (
              <button
                type="button"
                aria-label="Frame photo"
                aria-pressed={activeSelectionPanel === "frame"}
                title="Frame"
                onClick={() => toggleSelectionPanel("frame")}
              >
                <ImageBorderRegular />
                <span>Frame</span>
              </button>
            ) : null}
            {selectedLayer.kind === "text" ? (
              <label
                className="selected-layer-font-control"
                htmlFor={`selected-layer-font-${selectedLayer.id}`}
              >
                <span className="visually-hidden">Font</span>
                <FontFamilySelect
                  compact
                  id={`selected-layer-font-${selectedLayer.id}`}
                  value={selectedLayer.fontFamily}
                  onChange={(fontFamily) =>
                    changeLayer(selectedLayer.id, {
                      fontFamily,
                    } as Partial<PageLayer>)
                  }
                />
              </label>
            ) : null}
            {selectedLayer.kind === "text" ? (
              <TextAlignmentControl
                compact
                className="selected-layer-align-control"
                value={selectedLayer.align}
                onChange={(align) =>
                  changeLayer(selectedLayer.id, {
                    align,
                  } as Partial<PageLayer>)
                }
              />
            ) : null}
            <button
              type="button"
              aria-label="Delete layer"
              className="danger-action"
              title="Delete"
              onClick={() => onDeleteLayer(selectedLayer.id)}
            >
              <DeleteRegular />
              <span>Delete</span>
            </button>
          </div>
          {activeSelectionPanel === "frame" && selectedLayer.kind === "photo" ? (
            <div
              className="selected-layer-popover frame-popover"
              role="dialog"
              aria-label="Frame photo"
            >
              <fieldset className="frame-preset-grid">
                <legend className="visually-hidden">Frame preset</legend>
                {framePresetOptions.map((preset) => (
                  <button
                    type="button"
                    aria-pressed={selectedLayer.border.framePreset === preset}
                    key={preset}
                    onClick={() => updateSelectedPhotoBorder({ framePreset: preset })}
                  >
                    {formatFramePreset(preset)}
                  </button>
                ))}
              </fieldset>
              <label className="frame-popover-range">
                <span>Width</span>
                <input
                  max={160}
                  min={0}
                  type="range"
                  value={selectedLayer.border.width}
                  onChange={(event) =>
                    updateSelectedPhotoBorder({ width: Number(event.currentTarget.value) })
                  }
                />
              </label>
              <div className="frame-popover-field-row">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={selectedLayer.border.color}
                    onChange={(event) =>
                      updateSelectedPhotoBorder({ color: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  <span>Mask</span>
                  <select
                    value={selectedLayer.mask.shape}
                    onChange={(event) =>
                      updateSelectedPhotoMask({
                        shape: event.currentTarget.value as PhotoLayer["mask"]["shape"],
                      })
                    }
                  >
                    {maskShapeOptions.map((shape) => (
                      <option value={shape} key={shape}>
                        {formatMaskShape(shape)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {activeSelectionPanel === "edit" && selectedLayer ? (
        <div
          className="selected-layer-edit-overlay"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <section
            aria-label={`Edit ${selectedLayerLabel}`}
            aria-modal="true"
            className="selected-layer-edit-dialog"
            role="dialog"
          >
            <header className="selected-layer-edit-header">
              <div className="selected-layer-edit-title">
                <span>Layer</span>
                <h3>{selectedLayerLabel}</h3>
              </div>
              <button
                type="button"
                aria-label="Close editor"
                className="selected-layer-edit-close"
                title="Close"
                onClick={() => setActiveSelectionPanel(null)}
              >
                <DismissRegular />
              </button>
            </header>
            <div className="selected-layer-edit-body">
              <LayerInspector
                layer={selectedLayer}
                onChange={(update) => changeLayer(selectedLayer.id, update)}
                onChooseWashiTapePhoto={onChooseWashiTapePhoto}
                resolveWashiTapeHref={(layer) => resolveBrowserWashiTapeHref(assetById, layer)}
              />
            </div>
          </section>
        </div>
      ) : null}
      {contextMenu && contextLayer ? (
        <div
          ref={contextMenuRef}
          aria-label={`${contextLayerLabel} actions`}
          className="layer-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => openSelectionPanel("edit")}>
            <EditRegular />
            <span>Edit</span>
          </button>
          <button
            type="button"
            disabled={contextLayerIndex === document.layers.length - 1}
            role="menuitem"
            onClick={() =>
              runContextAction(() => onReorderLayer(contextLayer.id, document.layers.length - 1))
            }
          >
            <ArrowUpRegular />
            <span>Move to top</span>
          </button>
          <button
            type="button"
            disabled={contextLayerIndex === 0}
            role="menuitem"
            onClick={() => runContextAction(() => onReorderLayer(contextLayer.id, 0))}
          >
            <ArrowDownRegular />
            <span>Move to bottom</span>
          </button>
          <button
            type="button"
            disabled={contextLayerIndex === document.layers.length - 1}
            role="menuitem"
            onClick={() =>
              runContextAction(() => onReorderLayer(contextLayer.id, contextLayerIndex + 1))
            }
          >
            <ArrowUpRegular />
            <span>Move up</span>
          </button>
          <button
            type="button"
            disabled={contextLayerIndex === 0}
            role="menuitem"
            onClick={() =>
              runContextAction(() => onReorderLayer(contextLayer.id, contextLayerIndex - 1))
            }
          >
            <ArrowDownRegular />
            <span>Move down</span>
          </button>
          <button
            type="button"
            className="danger-menuitem"
            role="menuitem"
            onClick={() => runContextAction(() => onDeleteLayer(contextLayer.id))}
          >
            <DeleteRegular />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
