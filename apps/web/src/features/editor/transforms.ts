import type { PageLayer, PhotoLayer } from "@scrapbook/editor-core";

import type { CanvasPoint, ResizeHandle } from "./editorTypes";

export const resizeHandles: Array<{ handle: ResizeHandle; label: string }> = [
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

export type SelectionFrame = Pick<PageLayer, "height" | "width" | "x" | "y"> & {
  rotation: number;
};

export const getLayerCenter = (layer: PageLayer): CanvasPoint => ({
  x: layer.x + layer.width / 2,
  y: layer.y + layer.height / 2,
});

export const getAngle = (origin: CanvasPoint, point: CanvasPoint): number =>
  (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI;

export const normalizeRotation = (degrees: number): number => {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;

  return Number.isFinite(normalized) ? normalized : 0;
};

export const resizeLayerFromHandle = (
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

export const getLayerSelectionFrame = (layer: PageLayer): SelectionFrame => {
  if (layer.kind !== "photo") {
    return { height: layer.height, rotation: 0, width: layer.width, x: layer.x, y: layer.y };
  }

  return getPhotoSelectionFrame(layer);
};

const getPhotoSelectionFrame = (layer: PhotoLayer): SelectionFrame => {
  const imageWidth = layer.width / Math.max(layer.crop.width, 0.05);
  const imageHeight = layer.height / Math.max(layer.crop.height, 0.05);
  const imageX =
    layer.x - layer.crop.x * imageWidth + layer.photoTransform.offsetX * imageWidth * 0.5;
  const imageY =
    layer.y - layer.crop.y * imageHeight + layer.photoTransform.offsetY * imageHeight * 0.5;
  const layerCenter = getLayerCenter(layer);
  const imageCenter = {
    x: imageX + imageWidth / 2,
    y: imageY + imageHeight / 2,
  };
  const relativeCenter = rotatePoint(
    {
      x: (imageCenter.x - layerCenter.x) * layer.photoTransform.scale,
      y: (imageCenter.y - layerCenter.y) * layer.photoTransform.scale,
    },
    layer.photoTransform.rotation,
  );
  const width = imageWidth * layer.photoTransform.scale;
  const height = imageHeight * layer.photoTransform.scale;
  const center = {
    x: layerCenter.x + relativeCenter.x,
    y: layerCenter.y + relativeCenter.y,
  };

  return {
    height,
    rotation: layer.photoTransform.rotation,
    width,
    x: center.x - width / 2,
    y: center.y - height / 2,
  };
};
