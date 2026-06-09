import { createPhotoLayer, type PhotoLayer } from "@zakka/editor-core";
import { describe, expect, it } from "vitest";

import { cropPhotoLayerFromHandle } from "./transforms";

const makePhotoLayer = (overrides: Partial<PhotoLayer> = {}): PhotoLayer =>
  createPhotoLayer({
    assetId: "asset_test",
    id: "photo_test",
    x: 100,
    y: 200,
    width: 400,
    height: 400,
    rotation: 0,
    opacity: 1,
    locked: false,
    fit: "cover",
    crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, aspectRatioPreset: "free" },
    photoTransform: { scale: 1, rotation: 0, flipX: false, flipY: false, offsetX: 0, offsetY: 0 },
    ...overrides,
  });

/**
 * Computes the displayed image's left edge canvas X coordinate from a photo
 * layer, mirroring the rendering pipeline in `renderPhotoLayerSvg`. Used to
 * assert that cardinal crop drags don't shift the underlying image.
 */
const displayedImageLeftCanvasX = (layer: PhotoLayer): number => {
  const imageWidth = layer.width / Math.max(layer.crop.width, 0.05);
  const imageLeftLocal =
    -layer.crop.x * imageWidth + layer.photoTransform.offsetX * imageWidth * 0.5 - layer.width / 2;
  const layerCenterX = layer.x + layer.width / 2;
  return layerCenterX + imageLeftLocal * Math.max(layer.photoTransform.scale, 0.1);
};

const displayedImageTopCanvasY = (layer: PhotoLayer): number => {
  const imageHeight = layer.height / Math.max(layer.crop.height, 0.05);
  const imageTopLocal =
    -layer.crop.y * imageHeight +
    layer.photoTransform.offsetY * imageHeight * 0.5 -
    layer.height / 2;
  const layerCenterY = layer.y + layer.height / 2;
  return layerCenterY + imageTopLocal * Math.max(layer.photoTransform.scale, 0.1);
};

const displayedImageWidthCanvas = (layer: PhotoLayer): number =>
  (layer.width / Math.max(layer.crop.width, 0.05)) * Math.max(layer.photoTransform.scale, 0.1);

describe("cropPhotoLayerFromHandle", () => {
  it("keeps the displayed image anchored when shrinking from the west handle at scale > 1", () => {
    const layer = makePhotoLayer({
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, aspectRatioPreset: "free" },
      photoTransform: {
        scale: 2,
        rotation: 0,
        flipX: false,
        flipY: false,
        offsetX: 0,
        offsetY: 0,
      },
    });
    const before = displayedImageLeftCanvasX(layer);

    const update = cropPhotoLayerFromHandle(layer, "w", { x: 80, y: 0 }, { x: 60, y: 0 });
    const after = displayedImageLeftCanvasX({ ...layer, ...update } as PhotoLayer);

    expect(after).toBeCloseTo(before, 4);
  });

  it("lets the user grow the frame to the displayed (scaled) image edge when zoomed in", () => {
    const layer = makePhotoLayer({
      crop: { x: 0.2, y: 0.2, width: 0.6, height: 0.6, aspectRatioPreset: "free" },
      photoTransform: {
        scale: 2,
        rotation: 0,
        flipX: false,
        flipY: false,
        offsetX: 0,
        offsetY: 0,
      },
    });
    // Drag the west handle far to the left (well past the unscaled image edge).
    const update = cropPhotoLayerFromHandle(layer, "w", { x: -2000, y: 0 }, { x: 0, y: 0 });
    const updated = { ...layer, ...update } as PhotoLayer;

    // The frame should have grown beyond the original width (it was 400; the
    // displayed image width at scale=2 with crop.width=0.6 is 400/0.6*2 ≈ 1333).
    expect(updated.width).toBeGreaterThan(layer.width);
    expect(updated.width).toBeLessThanOrEqual((layer.width / 0.6) * 2 + 1);

    // The displayed image should still occupy the same canvas region — both its
    // left edge and its total width.
    expect(displayedImageLeftCanvasX(updated)).toBeCloseTo(displayedImageLeftCanvasX(layer), 3);
    expect(displayedImageWidthCanvas(updated)).toBeCloseTo(displayedImageWidthCanvas(layer), 3);
  });

  it("keeps the displayed image anchored when shrinking from the north handle at scale > 1", () => {
    const layer = makePhotoLayer({
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, aspectRatioPreset: "free" },
      photoTransform: {
        scale: 1.8,
        rotation: 0,
        flipX: false,
        flipY: false,
        offsetX: 0,
        offsetY: 0,
      },
    });
    const beforeTop = displayedImageTopCanvasY(layer);
    const beforeWidth = displayedImageWidthCanvas(layer);

    const update = cropPhotoLayerFromHandle(layer, "n", { x: 0, y: 40 }, { x: 0, y: 0 });
    const updated = { ...layer, ...update } as PhotoLayer;

    expect(displayedImageTopCanvasY(updated)).toBeCloseTo(beforeTop, 3);
    expect(displayedImageWidthCanvas(updated)).toBeCloseTo(beforeWidth, 3);
  });

  it("still behaves correctly at scale = 1 (no shift, frame capped at image edge)", () => {
    const layer = makePhotoLayer({
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, aspectRatioPreset: "free" },
    });
    const beforeLeft = displayedImageLeftCanvasX(layer);

    const update = cropPhotoLayerFromHandle(layer, "w", { x: 20, y: 0 }, { x: 0, y: 0 });
    const updated = { ...layer, ...update } as PhotoLayer;

    expect(displayedImageLeftCanvasX(updated)).toBeCloseTo(beforeLeft, 4);
    expect(updated.photoTransform.scale).toBeCloseTo(1, 4);
  });
});
