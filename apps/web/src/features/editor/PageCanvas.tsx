import { type PageDocument, type PageLayer, renderPageDocumentSvg } from "@scrapbook/editor-core";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useMemo, useRef, useState } from "react";

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
