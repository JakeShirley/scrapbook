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
  normalizeRotation,
  resizeHandles,
  resizeLayerFromHandle,
} from "./transforms";

export function PageCanvas({
  assetById,
  document,
  selectedLayerId,
  onDeleteLayer,
  onReorderLayer,
  onSelectLayer,
  onTransformLayer,
}: {
  assetById: Map<string, Asset>;
  document: PageDocument;
  selectedLayerId: string | null;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayer: (layerId: string, toIndex: number) => void;
  onSelectLayer: (layerId: string) => void;
  onTransformLayer: (layerId: string, update: Partial<PageLayer>) => void;
}) {
  const canvasRef = useRef<HTMLFieldSetElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const [contextMenu, setContextMenu] = useState<{ layerId: string; x: number; y: number } | null>(
    null,
  );
  const renderedSvg = useMemo(
    () =>
      renderPageDocumentSvg(document, {
        resolvePhotoHref: (layer) =>
          assetById.get(layer.assetId)?.originalContentUrl ??
          assetById.get(layer.assetId)?.thumbnailUrl,
      }),
    [assetById, document],
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
  const transformLayer = (event: ReactPointerEvent<HTMLElement>) => {
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
  const stopTransform = (event: ReactPointerEvent<HTMLElement>) => {
    if (activeTransform?.pointerId === event.pointerId) setActiveTransform(null);
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
