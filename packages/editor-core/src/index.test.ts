import { describe, expect, it } from "vitest";

import {
  addLayer,
  createPageDocument,
  createPhotoLayer,
  createTextLayer,
  deleteLayer,
  duplicateLayer,
  pageDocumentSchema,
  reorderLayer,
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
});
