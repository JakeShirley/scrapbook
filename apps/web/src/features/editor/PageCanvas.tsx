import { ArrowDownRegular, ArrowUpRegular, DeleteRegular } from "@fluentui/react-icons";
import { type PageDocument, type PageLayer, renderPageDocumentSvg } from "@scrapbook/editor-core";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Asset } from "../../types";
import type { ActiveTransform, CanvasPoint, ResizeHandle, TransformMode } from "./editorTypes";
import {
  getAngle,
  getLayerCenter,
  getLayerSelectionFrame,
  normalizeRotation,
  resizeHandles,
  resizeLayerFromHandle,
} from "./transforms";

export function PageCanvas({
  assetById,
  document,
  previewLayers = [],
  selectedLayerId,
  onDeleteLayer,
  onReorderLayer,
  onSelectLayer,
  onTransformEnd,
  onTransformLayer,
}: {
  assetById: Map<string, Asset>;
  document: PageDocument;
  previewLayers?: PageLayer[];
  selectedLayerId: string | null;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayer: (layerId: string, toIndex: number) => void;
  onSelectLayer: (layerId: string | null) => void;
  onTransformEnd?: (layerId: string, update: Partial<PageLayer> | null) => void;
  onTransformLayer: (layerId: string, update: Partial<PageLayer>) => void;
}) {
  const canvasRef = useRef<HTMLFieldSetElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const [contextMenu, setContextMenu] = useState<{ layerId: string; x: number; y: number } | null>(
    null,
  );
  const renderedDocument = useMemo(
    () =>
      previewLayers.length > 0
        ? { ...document, layers: [...document.layers, ...previewLayers] }
        : document,
    [document, previewLayers],
  );
  const renderedSvg = useMemo(
    () =>
      renderPageDocumentSvg(renderedDocument, {
        resolvePhotoHref: (layer) =>
          assetById.get(layer.assetId)?.originalContentUrl ??
          assetById.get(layer.assetId)?.thumbnailUrl,
      }),
    [assetById, renderedDocument],
  );
  const contextLayerIndex = contextMenu
    ? document.layers.findIndex((layer) => layer.id === contextMenu.layerId)
    : -1;
  const contextLayer = contextLayerIndex >= 0 ? document.layers[contextLayerIndex] : null;
  const closeContextMenu = () => setContextMenu(null);
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
    onTransformLayer(activeTransform.layerId, getTransformUpdate(activeTransform, pointer));
  };
  const stopTransform = (event: ReactPointerEvent<HTMLElement>) => {
    if (activeTransform?.pointerId !== event.pointerId) return;
    const transform = activeTransform;
    const pointer = getCanvasPoint(event);
    const update = pointer ? getTransformUpdate(transform, pointer) : null;

    setActiveTransform(null);

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
    const menuHeight = 190;
    const margin = 8;
    setContextMenu({
      layerId: layer.id,
      x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
      y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
    });
  };
  const runContextAction = (action: () => void) => {
    action();
    closeContextMenu();
  };
  const clearSelection = (event: ReactPointerEvent<HTMLFieldSetElement>) => {
    if (event.button !== 0 || activeTransform) return;
    if (contextMenuRef.current?.contains(event.target as Node)) return;
    closeContextMenu();
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
        const selectionFrame = getLayerSelectionFrame(layer);
        const selectionFrameStyle: CSSProperties = {
          left: `${((selectionFrame.x - layer.x) / layer.width) * 100}%`,
          top: `${((selectionFrame.y - layer.y) / layer.height) * 100}%`,
          width: `${(selectionFrame.width / layer.width) * 100}%`,
          height: `${(selectionFrame.height / layer.height) * 100}%`,
          transform: `rotate(${selectionFrame.rotation}deg)`,
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
              onContextMenu={(event) => openContextMenu(event, layer)}
              onPointerDown={(event) => startTransform(event, layer, "move")}
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
          </div>
        );
      })}
      {contextMenu && contextLayer ? (
        <div
          ref={contextMenuRef}
          aria-label={`${contextLayer.name} layer actions`}
          className="layer-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
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
