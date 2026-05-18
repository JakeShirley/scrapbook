import { describe, expect, it } from "vitest";

import {
  addLayer,
  createBookSpreads,
  createEmbellishmentLayer,
  createPageDocument,
  createPhotoLayer,
  createTextLayer,
  deleteLayer,
  duplicateLayer,
  pageDocumentSchema,
  renderPageDocumentSvg,
  reorderLayer,
  resetPhotoLayerEdits,
  updateCanvas,
  updateLayer,
} from "./index.js";

describe("page document helpers", () => {
  it("creates a versioned page document with canvas settings", () => {
    const document = createPageDocument({ canvas: { width: 1200, height: 900 } });

    expect(pageDocumentSchema.parse(document)).toMatchObject({
      version: 1,
      canvas: { width: 1200, height: 900, backgroundColor: "#fffdf7" },
      layers: [],
    });
  });

  it("adds, updates, reorders, duplicates, and deletes layers immutably", () => {
    const photo = createPhotoLayer({ assetId: "asset_1", id: "photo_1" });
    const text = createTextLayer({ id: "text_1", text: "Family picnic" });
    const withLayers = addLayer(addLayer(createPageDocument(), photo), text);
    const updated = updateLayer(withLayers, "photo_1", { x: 500, rotation: 12 });
    const reordered = reorderLayer(updated, "photo_1", 1);
    const duplicated = duplicateLayer(reordered, "text_1", "text_2");
    const deleted = deleteLayer(duplicated, "photo_1");

    expect(withLayers.layers.map((layer) => layer.id)).toEqual(["photo_1", "text_1"]);
    expect(updated.layers[0]).toMatchObject({ id: "photo_1", x: 500, rotation: 12 });
    expect(reordered.layers.map((layer) => layer.id)).toEqual(["text_1", "photo_1"]);
    expect(duplicated.layers.map((layer) => layer.id)).toEqual(["text_1", "text_2", "photo_1"]);
    expect(deleted.layers.map((layer) => layer.id)).toEqual(["text_1", "text_2"]);
  });

  it("updates canvas settings without changing layers", () => {
    const text = createTextLayer({ id: "text_1", text: "Caption" });
    const document = addLayer(createPageDocument(), text);
    const updated = updateCanvas(document, { backgroundColor: "#ffffff" });

    expect(updated.canvas.backgroundColor).toBe("#ffffff");
    expect(updated.layers).toEqual(document.layers);
  });

  it("adds non-destructive photo edit metadata without changing the asset reference", () => {
    const photo = createPhotoLayer({
      assetId: "asset_1",
      id: "photo_1",
      crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6, aspectRatioPreset: "free" },
      photoTransform: {
        scale: 1.25,
        rotation: 8,
        flipX: true,
        flipY: false,
        offsetX: 0.12,
        offsetY: -0.08,
      },
      border: {
        width: 24,
        color: "#ffffff",
        radius: 36,
        style: "solid",
        framePreset: "polaroid",
      },
      mask: { shape: "ellipse", inset: 0.04, feather: 6 },
      filter: { preset: "warm", brightness: 1.05, contrast: 0.95, saturation: 1.2 },
      shadow: {
        enabled: true,
        color: "#202426",
        opacity: 0.3,
        offsetX: 0,
        offsetY: 18,
        blur: 32,
        spread: 0,
      },
    });

    expect(photo.assetId).toBe("asset_1");
    expect(photo.photoTransform).toMatchObject({ scale: 1.25, flipX: true });
    expect(photo.crop).toMatchObject({ x: 0.1, width: 0.7 });
    expect(photo.mask.shape).toBe("ellipse");
    expect(photo.border.framePreset).toBe("polaroid");
  });

  it("keeps old photo documents compatible and can reset edits to the original view", () => {
    const parsed = pageDocumentSchema.parse({
      version: 1,
      canvas: { width: 1200, height: 900, backgroundColor: "#ffffff" },
      layers: [
        {
          id: "photo_legacy",
          kind: "photo",
          name: "Legacy photo",
          assetId: "asset_1",
          x: 10,
          y: 20,
          width: 400,
          height: 300,
          rotation: 0,
          opacity: 1,
          locked: false,
          fit: "cover",
        },
      ],
    });
    const layer = parsed.layers[0];

    expect(layer?.kind).toBe("photo");

    if (layer?.kind !== "photo") {
      throw new Error("Expected a photo layer");
    }

    const edited = createPhotoLayer({
      ...layer,
      crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.6, aspectRatioPreset: "square" },
      photoTransform: { ...layer.photoTransform, scale: 1.8, offsetX: 0.2 },
    });
    const reset = resetPhotoLayerEdits(edited);

    expect(layer.photoTransform).toMatchObject({ scale: 1, offsetX: 0 });
    expect(layer.crop).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
    expect(reset.assetId).toBe("asset_1");
    expect(reset.photoTransform).toMatchObject({ scale: 1, offsetX: 0 });
    expect(reset.crop).toMatchObject({ x: 0, y: 0, width: 1, height: 1 });
    expect(reset.mask.shape).toBe("rectangle");
  });

  it("creates scrapbook embellishment layers", () => {
    const embellishment = createEmbellishmentLayer({
      id: "sticker_1",
      element: "paper-label",
      color: "#fffdf7",
      accentColor: "#d56d46",
      label: "Picnic",
    });
    const document = addLayer(createPageDocument(), embellishment);

    expect(document.layers[0]).toMatchObject({
      id: "sticker_1",
      kind: "embellishment",
      element: "paper-label",
      label: "Picnic",
    });
  });

  it("renders page primitives through the shared SVG renderer", () => {
    const photo = createPhotoLayer({
      assetId: "asset_1",
      id: "photo_1",
      mask: { shape: "ticket", inset: 0.08, feather: 0 },
    });
    const text = createTextLayer({ id: "text_1", text: "Family & friends" });
    const embellishment = createEmbellishmentLayer({
      id: "sticker_1",
      element: "washi-tape",
      color: "#79a9a4",
    });
    const document = createPageDocument({ layers: [photo, text, embellishment] });
    const svg = renderPageDocumentSvg(document, {
      resolvePhotoHref: (layer) => `/assets/${layer.assetId}/content`,
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain("photo_clip_0");
    expect(svg).toContain("Family &amp; friends");
    expect(svg).toContain("/assets/asset_1/content");
    expect(svg).toContain('stroke-opacity="0.34"');
  });

  it("groups ordered book pages into facing spreads without synthetic pages", () => {
    const spreads = createBookSpreads([
      { pageId: "page_3", sortOrder: 3 },
      { pageId: "page_0", sortOrder: 0 },
      { pageId: "page_2", sortOrder: 2 },
      { pageId: "page_1", sortOrder: 1 },
    ]);

    expect(spreads).toEqual([
      {
        spreadIndex: 0,
        kind: "facing",
        leftPageId: "page_0",
        rightPageId: "page_1",
        pageIds: ["page_0", "page_1"],
      },
      {
        spreadIndex: 1,
        kind: "facing",
        leftPageId: "page_2",
        rightPageId: "page_3",
        pageIds: ["page_2", "page_3"],
      },
    ]);
  });

  it("keeps an unpaired final book page as a single real page", () => {
    const spreads = createBookSpreads([
      { pageId: "page_2", sortOrder: 2 },
      { pageId: "page_0", sortOrder: 0 },
      { pageId: "page_1", sortOrder: 1 },
    ]);

    expect(spreads).toEqual([
      {
        spreadIndex: 0,
        kind: "facing",
        leftPageId: "page_0",
        rightPageId: "page_1",
        pageIds: ["page_0", "page_1"],
      },
      {
        spreadIndex: 1,
        kind: "single",
        leftPageId: "page_2",
        rightPageId: null,
        pageIds: ["page_2"],
      },
    ]);
  });
});
