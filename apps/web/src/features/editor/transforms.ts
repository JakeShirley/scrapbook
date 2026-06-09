import {
  getTextLayerRenderedBounds,
  type PageLayer,
  type PhotoLayer,
  type TextLayer,
} from "@zakka/editor-core";

import type { CanvasPoint, ResizeHandle } from "./editorTypes";

export type MultiSelectionResizeHandle = "nw" | "ne" | "se" | "sw";

export const multiSelectionResizeHandles: Array<{
  handle: MultiSelectionResizeHandle;
  label: string;
}> = [
  { handle: "nw", label: "Scale group from top left" },
  { handle: "ne", label: "Scale group from top right" },
  { handle: "se", label: "Scale group from bottom right" },
  { handle: "sw", label: "Scale group from bottom left" },
];

export type LayerTransformUpdate = { layerId: string; update: Partial<PageLayer> };

export type GroupBoundingBox = { height: number; width: number; x: number; y: number };

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

// Uniform (aspect-ratio preserving) scale from the opposite corner. Used for photo
// corner handles so dragging a corner zooms the entire photo without distorting it.
export const scaleLayerFromCornerHandle = (
  layer: PageLayer,
  handle: ResizeHandle,
  pointer: CanvasPoint,
  startPointer: CanvasPoint,
): Pick<PageLayer, "height" | "width" | "x" | "y"> => {
  const localDelta = rotatePoint(
    { x: pointer.x - startPointer.x, y: pointer.y - startPointer.y },
    -layer.rotation,
  );
  const pivotLocal: CanvasPoint = {
    x: handle.includes("w") ? layer.width / 2 : -layer.width / 2,
    y: handle.includes("n") ? layer.height / 2 : -layer.height / 2,
  };
  const startCornerLocal: CanvasPoint = { x: -pivotLocal.x, y: -pivotLocal.y };
  const newCornerLocal: CanvasPoint = {
    x: startCornerLocal.x + localDelta.x,
    y: startCornerLocal.y + localDelta.y,
  };
  const diag: CanvasPoint = {
    x: startCornerLocal.x - pivotLocal.x,
    y: startCornerLocal.y - pivotLocal.y,
  };
  const diagLenSq = diag.x * diag.x + diag.y * diag.y || 1;
  const newDiag: CanvasPoint = {
    x: newCornerLocal.x - pivotLocal.x,
    y: newCornerLocal.y - pivotLocal.y,
  };
  const projectedScale = (newDiag.x * diag.x + newDiag.y * diag.y) / diagLenSq;
  const minScale = minimumLayerSize / Math.max(layer.width, layer.height, 1);
  const scale = Math.max(projectedScale, minScale);

  const width = layer.width * scale;
  const height = layer.height * scale;
  const layerCenter = getLayerCenter(layer);
  const pivotShift = rotatePoint(pivotLocal, layer.rotation);
  const pivotCanvas = { x: layerCenter.x + pivotShift.x, y: layerCenter.y + pivotShift.y };
  const newPivotShift = rotatePoint(
    { x: pivotLocal.x * scale, y: pivotLocal.y * scale },
    layer.rotation,
  );
  const center = {
    x: pivotCanvas.x - newPivotShift.x,
    y: pivotCanvas.y - newPivotShift.y,
  };

  return { height, width, x: center.x - width / 2, y: center.y - height / 2 };
};

// Crop adjustment: moving a cardinal edge shrinks or grows the visible frame while
// the underlying image stays anchored in canvas space, so the displayed image is
// neither scaled nor repositioned -- only more or less of it is shown.
export const cropPhotoLayerFromHandle = (
  layer: PhotoLayer,
  handle: ResizeHandle,
  pointer: CanvasPoint,
  startPointer: CanvasPoint,
): Pick<PhotoLayer, "height" | "width" | "x" | "y" | "crop"> => {
  const localDelta = rotatePoint(
    { x: pointer.x - startPointer.x, y: pointer.y - startPointer.y },
    -layer.rotation,
  );
  const safeCropWidth = Math.max(layer.crop.width, 0.05);
  const safeCropHeight = Math.max(layer.crop.height, 0.05);
  const imageWidth = layer.width / safeCropWidth;
  const imageHeight = layer.height / safeCropHeight;
  // Image extent in layer-center-local coordinates (rotation ignored; localDelta
  // already accounts for layer.rotation). The displayed image spans this region;
  // the visible frame is a sub-window of it.
  const imageLeftLocal =
    -layer.crop.x * imageWidth + layer.photoTransform.offsetX * imageWidth * 0.5 - layer.width / 2;
  const imageRightLocal = imageLeftLocal + imageWidth;
  const imageTopLocal =
    -layer.crop.y * imageHeight +
    layer.photoTransform.offsetY * imageHeight * 0.5 -
    layer.height / 2;
  const imageBottomLocal = imageTopLocal + imageHeight;

  let left = -layer.width / 2;
  let right = layer.width / 2;
  let top = -layer.height / 2;
  let bottom = layer.height / 2;

  if (handle.includes("w")) left += localDelta.x;
  if (handle.includes("e")) right += localDelta.x;
  if (handle.includes("n")) top += localDelta.y;
  if (handle.includes("s")) bottom += localDelta.y;

  if (left < imageLeftLocal) left = imageLeftLocal;
  if (right > imageRightLocal) right = imageRightLocal;
  if (top < imageTopLocal) top = imageTopLocal;
  if (bottom > imageBottomLocal) bottom = imageBottomLocal;

  const minWidth = Math.max(minimumLayerSize, 0.05 * imageWidth);
  const minHeight = Math.max(minimumLayerSize, 0.05 * imageHeight);
  if (right - left < minWidth) {
    if (handle.includes("w")) left = right - minWidth;
    else right = left + minWidth;
  }
  if (bottom - top < minHeight) {
    if (handle.includes("n")) top = bottom - minHeight;
    else bottom = top + minHeight;
  }

  const width = right - left;
  const height = bottom - top;
  const nextCropX =
    (left - imageLeftLocal + layer.photoTransform.offsetX * imageWidth * 0.5) / imageWidth;
  const nextCropY =
    (top - imageTopLocal + layer.photoTransform.offsetY * imageHeight * 0.5) / imageHeight;
  const nextCropWidth = width / imageWidth;
  const nextCropHeight = height / imageHeight;

  const shift = rotatePoint({ x: (left + right) / 2, y: (top + bottom) / 2 }, layer.rotation);
  const startCenter = getLayerCenter(layer);
  const center = { x: startCenter.x + shift.x, y: startCenter.y + shift.y };
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  return {
    height,
    width,
    x: center.x - width / 2,
    y: center.y - height / 2,
    crop: {
      ...layer.crop,
      x: clamp(nextCropX, 0, 1 - 0.05),
      y: clamp(nextCropY, 0, 1 - 0.05),
      width: clamp(nextCropWidth, 0.05, 1),
      height: clamp(nextCropHeight, 0.05, 1),
    },
  };
};

// Pan the underlying photo within its crop window. Returns the updated offset for
// `photoTransform`, clamped so the image continues to cover the frame.
export const panPhotoLayer = (
  layer: PhotoLayer,
  pointer: CanvasPoint,
  startPointer: CanvasPoint,
  startOffset: { offsetX: number; offsetY: number },
): { offsetX: number; offsetY: number } => {
  const localDelta = rotatePoint(
    { x: pointer.x - startPointer.x, y: pointer.y - startPointer.y },
    -(layer.rotation + layer.photoTransform.rotation),
  );
  const imageWidth = layer.width / Math.max(layer.crop.width, 0.05);
  const imageHeight = layer.height / Math.max(layer.crop.height, 0.05);
  const scale = Math.max(layer.photoTransform.scale, 0.1);
  const flipX = layer.photoTransform.flipX ? -1 : 1;
  const flipY = layer.photoTransform.flipY ? -1 : 1;
  const nextOffsetX = startOffset.offsetX + (localDelta.x * 2 * flipX) / (imageWidth * scale);
  const nextOffsetY = startOffset.offsetY + (localDelta.y * 2 * flipY) / (imageHeight * scale);
  return clampPhotoPanOffset(layer, { offsetX: nextOffsetX, offsetY: nextOffsetY });
};

// Clamp a pan offset so the source image continues to cover the crop frame
// at the layer's current scale.
export const clampPhotoPanOffset = (
  layer: PhotoLayer,
  offset: { offsetX: number; offsetY: number },
): { offsetX: number; offsetY: number } => {
  const scale = Math.max(layer.photoTransform.scale, 0.1);
  const minOffsetX = 2 * (layer.crop.x + layer.crop.width) - 1 - scale;
  const maxOffsetX = 2 * layer.crop.x + scale - 1;
  const minOffsetY = 2 * (layer.crop.y + layer.crop.height) - 1 - scale;
  const maxOffsetY = 2 * layer.crop.y + scale - 1;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return {
    offsetX: clamp(offset.offsetX, Math.max(-1, minOffsetX), Math.min(1, maxOffsetX)),
    offsetY: clamp(offset.offsetY, Math.max(-1, minOffsetY), Math.min(1, maxOffsetY)),
  };
};

export const getLayerSelectionFrame = (layer: PageLayer): SelectionFrame => {
  if (layer.kind === "text") {
    const bounds = getTextLayerRenderedBounds(layer);
    return { ...bounds, rotation: 0 };
  }
  return { height: layer.height, rotation: 0, width: layer.width, x: layer.x, y: layer.y };
};

const getRotatedFrameCorners = (frame: SelectionFrame): CanvasPoint[] => {
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const halfWidth = frame.width / 2;
  const halfHeight = frame.height / 2;
  const corners: CanvasPoint[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  return corners.map((corner) => {
    const rotated = rotatePoint(corner, frame.rotation);

    return { x: centerX + rotated.x, y: centerY + rotated.y };
  });
};

export const getMultiSelectionBoundingBox = (layers: PageLayer[]): GroupBoundingBox | null => {
  if (layers.length === 0) return null;

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const layer of layers) {
    for (const corner of getRotatedFrameCorners(getLayerSelectionFrame(layer))) {
      if (corner.x < left) left = corner.x;
      if (corner.x > right) right = corner.x;
      if (corner.y < top) top = corner.y;
      if (corner.y > bottom) bottom = corner.y;
    }
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

  return { height: bottom - top, width: right - left, x: left, y: top };
};

export const applyGroupMove = (
  startLayers: PageLayer[],
  delta: CanvasPoint,
): LayerTransformUpdate[] =>
  startLayers.map((layer) => ({
    layerId: layer.id,
    update: { x: layer.x + delta.x, y: layer.y + delta.y } as Partial<PageLayer>,
  }));

export const applyGroupRotate = (
  startLayers: PageLayer[],
  origin: CanvasPoint,
  angleDelta: number,
): LayerTransformUpdate[] => {
  if (angleDelta === 0) {
    return startLayers.map((layer) => ({ layerId: layer.id, update: {} }));
  }

  return startLayers.map((layer) => {
    const center = getLayerCenter(layer);
    const rotated = rotatePoint({ x: center.x - origin.x, y: center.y - origin.y }, angleDelta);
    const nextCenter = { x: origin.x + rotated.x, y: origin.y + rotated.y };

    return {
      layerId: layer.id,
      update: {
        rotation: normalizeRotation(layer.rotation + angleDelta),
        x: nextCenter.x - layer.width / 2,
        y: nextCenter.y - layer.height / 2,
      } as Partial<PageLayer>,
    };
  });
};

const minimumGroupScale = 0.05;

export const getGroupScaleFromHandle = (
  handle: MultiSelectionResizeHandle,
  startBox: GroupBoundingBox,
  pointer: CanvasPoint,
  startPointer: CanvasPoint,
): { pivot: CanvasPoint; scale: number } => {
  const startCornerX = handle.includes("e") ? startBox.x + startBox.width : startBox.x;
  const startCornerY = handle.includes("s") ? startBox.y + startBox.height : startBox.y;
  const pivot: CanvasPoint = {
    x: handle.includes("e") ? startBox.x : startBox.x + startBox.width,
    y: handle.includes("s") ? startBox.y : startBox.y + startBox.height,
  };
  const startDiagonalX = startCornerX - pivot.x;
  const startDiagonalY = startCornerY - pivot.y;
  const nextCornerX = startCornerX + (pointer.x - startPointer.x);
  const nextCornerY = startCornerY + (pointer.y - startPointer.y);
  const scaleX = startDiagonalX === 0 ? 1 : (nextCornerX - pivot.x) / startDiagonalX;
  const scaleY = startDiagonalY === 0 ? 1 : (nextCornerY - pivot.y) / startDiagonalY;
  const uniformScale = Math.max(Math.min(scaleX, scaleY), minimumGroupScale);

  return { pivot, scale: uniformScale };
};

export const applyGroupScale = (
  startLayers: PageLayer[],
  pivot: CanvasPoint,
  scale: number,
): LayerTransformUpdate[] =>
  startLayers.map((layer) => {
    const nextWidth = Math.max(layer.width * scale, 1);
    const nextHeight = Math.max(layer.height * scale, 1);
    const nextX = pivot.x + (layer.x - pivot.x) * scale;
    const nextY = pivot.y + (layer.y - pivot.y) * scale;
    const update: Partial<PageLayer> = {
      height: nextHeight,
      width: nextWidth,
      x: nextX,
      y: nextY,
    };

    if (layer.kind === "text") {
      const textLayer = layer as TextLayer;
      const nextFontSize = Math.min(Math.max(textLayer.fontSize * scale, 6), 240);
      (update as Partial<TextLayer>).fontSize = nextFontSize;
    }

    return { layerId: layer.id, update };
  });
