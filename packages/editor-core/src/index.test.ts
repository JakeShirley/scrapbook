import { describe, expect, it, vi } from "vitest";

import {
  addLayer,
  createBookSpreads,
  createEmbellishmentLayer,
  createPageDocument,
  createPhotoLayer,
  createStickerLayer,
  createTextLayer,
  createWashiTapeLayer,
  deleteLayer,
  duplicateLayer,
  editorFontDefinitions,
  editorFontFaceCss,
  getPhotoFrameLayout,
  loveYaLikeASisterFontFamily,
  pageDocumentSchema,
  renderPageDocumentSvg,
  reorderLayer,
  resetPhotoLayerEdits,
  resizePageDocument,
  updateCanvas,
  updateLayer,
  type WashiTapeLayer,
} from "./index.js";

const washiTapeOutlineCases: WashiTapeLayer["outline"][] = [
  "straight",
  "angled",
  "rounded",
  "torn",
  "notched",
  "bracket",
  "pinched",
  "tapered",
  "scallop",
  "stamp",
  "wave",
];

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

  it("creates layer ids when native crypto randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(1);
        return bytes;
      },
    });

    try {
      const photo = createPhotoLayer({ assetId: "asset_1" });

      expect(photo.id).toMatch(
        /^layer_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rounds layer transform values to the nearest tenth", () => {
    const photo = createPhotoLayer({ assetId: "asset_1", id: "photo_1" });
    const document = addLayer(createPageDocument(), photo);
    const updated = updateLayer(document, "photo_1", {
      x: 123.44,
      y: 234.56,
      width: 345.55,
      height: 456.04,
      rotation: -12.34,
      photoTransform: {
        ...photo.photoTransform,
        scale: 1.24,
        rotation: 8.76,
        offsetX: 0.12,
        offsetY: -0.04,
      },
    });
    const layer = updated.layers[0];

    expect(layer).toMatchObject({
      x: 123.4,
      y: 234.6,
      width: 345.6,
      height: 456,
      rotation: -12.3,
    });
    expect(layer?.kind).toBe("photo");

    if (layer?.kind !== "photo") {
      throw new Error("Expected a photo layer");
    }

    expect(layer.photoTransform).toMatchObject({
      scale: 1.2,
      rotation: 8.8,
      offsetX: 0.1,
      offsetY: 0,
    });
  });

  it("updates canvas settings without changing layers", () => {
    const text = createTextLayer({ id: "text_1", text: "Caption" });
    const document = addLayer(createPageDocument(), text);
    const updated = updateCanvas(document, { backgroundColor: "#ffffff" });

    expect(updated.canvas.backgroundColor).toBe("#ffffff");
    expect(updated.layers).toEqual(document.layers);
  });

  it("resizes a page document and scales layer geometry", () => {
    const text = createTextLayer({
      id: "text_1",
      text: "Caption",
      x: 120,
      y: 90,
      width: 600,
      height: 120,
      fontSize: 48,
    });
    const photo = createPhotoLayer({
      assetId: "asset_1",
      id: "photo_1",
      x: 300,
      y: 180,
      width: 240,
      height: 180,
    });
    const document = createPageDocument({
      canvas: { width: 1200, height: 900 },
      layers: [text, photo],
    });
    const resized = resizePageDocument(document, { width: 2400, height: 1800 });

    expect(resized.canvas).toMatchObject({ width: 2400, height: 1800 });
    expect(resized.layers[0]).toMatchObject({
      id: "text_1",
      x: 240,
      y: 180,
      width: 1200,
      height: 240,
      fontSize: 96,
    });
    expect(resized.layers[1]).toMatchObject({
      id: "photo_1",
      x: 600,
      y: 360,
      width: 480,
      height: 360,
    });
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
    expect(photo.photoTransform).toMatchObject({ scale: 1.3, flipX: true });
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
    expect(layer).not.toHaveProperty("name");

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

  it("creates package-backed sticker layers and normalizes legacy ids", () => {
    const sticker = createStickerLayer({ id: "sticker_1", stickerId: "rainbow" });
    const document = addLayer(createPageDocument(), sticker);

    expect(document.layers[0]).toMatchObject({
      id: "sticker_1",
      kind: "sticker",
      stickerId: "noto:rainbow",
    });
  });

  it("creates first-class washi tape layers with tiled photo styling", () => {
    const washiTape = createWashiTapeLayer({
      id: "washi_1",
      outline: "scallop",
      pattern: { kind: "stripe", primaryColor: "#fffdf7", secondaryColor: "#79a9a4" },
      tile: {
        offsetX: 0.14,
        offsetY: -0.04,
        rotation: 8.76,
        scale: 0.74,
        scaleX: 1.24,
        scaleY: 0.64,
      },
    });
    const document = addLayer(createPageDocument(), washiTape);

    expect(pageDocumentSchema.parse(document).layers[0]).toMatchObject({
      id: "washi_1",
      kind: "washiTape",
      outline: "scallop",
      pattern: { kind: "stripe", primaryColor: "#fffdf7", secondaryColor: "#79a9a4" },
      tile: {
        offsetX: 0.14,
        offsetY: -0.04,
        rotation: 8.8,
        scale: 0.74,
        scaleX: 1.24,
        scaleY: 0.64,
      },
    });

    expect(
      createWashiTapeLayer({
        tile: { offsetX: 1, offsetY: -1, scale: 0.95, scaleX: 0.01, scaleY: 0.01 },
      }).tile,
    ).toMatchObject({
      offsetX: 1,
      offsetY: -1,
      scale: 0.95,
      scaleX: 0.01,
      scaleY: 0.01,
    });

    expect(createWashiTapeLayer({ assetId: "asset_1" }).pattern).toMatchObject({
      assetId: "asset_1",
      kind: "customPhoto",
    });
  });

  it("keeps legacy photo-backed washi tape documents compatible", () => {
    const parsed = pageDocumentSchema.parse({
      version: 1,
      canvas: { width: 1200, height: 900, backgroundColor: "#ffffff" },
      layers: [
        {
          id: "washi_legacy",
          kind: "washiTape",
          assetId: "asset_1",
          x: 10,
          y: 20,
          width: 400,
          height: 80,
          rotation: 0,
          opacity: 1,
          locked: false,
          outline: "torn",
        },
      ],
    });
    const layer = parsed.layers[0];

    expect(layer?.kind).toBe("washiTape");
    expect(layer).toMatchObject({
      assetId: "asset_1",
      pattern: { kind: "customPhoto" },
    });
  });

  it("renders built-in washi tape patterns without photo assets", () => {
    const patternCases: WashiTapeLayer["pattern"]["kind"][] = [
      "solid",
      "polkaDot",
      "stripe",
      "grid",
      "checker",
    ];
    const layers = patternCases.map((pattern, index) =>
      createWashiTapeLayer({
        height: 80,
        id: `washi_${pattern}`,
        pattern: { kind: pattern, primaryColor: "#fffdf7", secondaryColor: "#79a9a4" },
        width: 240,
        x: index * 260,
        y: 0,
      }),
    );
    const document = createPageDocument({ canvas: { height: 320, width: 1800 }, layers });
    const svg = renderPageDocumentSvg(document);

    expect(svg).toContain("#fffdf7");
    expect(svg).toContain("#79a9a4");
    expect(svg).not.toContain("/assets/");
    expect(svg).not.toContain("NaN");
  });

  it("renders polka dot washi tape with uniform rows", () => {
    const washiTape = createWashiTapeLayer({
      height: 80,
      id: "washi_polka_dot",
      pattern: { kind: "polkaDot", primaryColor: "#fffdf7", secondaryColor: "#79a9a4" },
      width: 240,
    });
    const svg = renderPageDocumentSvg(createPageDocument({ layers: [washiTape] }));

    expect(svg.match(/<circle /g)).toHaveLength(4);
    expect(svg).toContain('cx="20" cy="20"');
    expect(svg).toContain('cx="60" cy="60"');
  });

  it("renders washi tape patterns with independent tile x and y scale", () => {
    const washiTape = createWashiTapeLayer({
      height: 80,
      id: "washi_scaled_pattern",
      pattern: { kind: "grid", primaryColor: "#fffdf7", secondaryColor: "#79a9a4" },
      tile: { scale: 1, scaleX: 1.5, scaleY: 0.5 },
      width: 320,
    });
    const svg = renderPageDocumentSvg(createPageDocument({ layers: [washiTape] }));

    expect(svg).toContain('width="120" height="40"');
    expect(svg).toContain("V 40 M 0 20 H 120");
  });

  it("keeps washi tape pattern scale stable when the layer is resized", () => {
    const pattern = { kind: "grid" as const, primaryColor: "#fffdf7", secondaryColor: "#79a9a4" };
    const regularTapeSvg = renderPageDocumentSvg(
      createPageDocument({
        layers: [createWashiTapeLayer({ height: 80, id: "washi_regular", pattern, width: 240 })],
      }),
    );
    const resizedTapeSvg = renderPageDocumentSvg(
      createPageDocument({
        layers: [createWashiTapeLayer({ height: 180, id: "washi_resized", pattern, width: 520 })],
      }),
    );

    expect(regularTapeSvg).toContain('width="80" height="80"');
    expect(resizedTapeSvg).toContain('width="80" height="80"');
  });

  it("renders every washi tape outline type", () => {
    const layers = washiTapeOutlineCases.map((outline, index) =>
      createWashiTapeLayer({
        assetId: "asset_1",
        height: 80,
        id: `washi_${outline}`,
        outline,
        width: 240,
        x: index * 260,
        y: 0,
      }),
    );
    const document = createPageDocument({
      canvas: { height: 320, width: 3200 },
      layers,
    });
    const svg = renderPageDocumentSvg(document, {
      resolveWashiTapeHref: (layer) => `/assets/${layer.assetId}/content`,
    });

    for (const outline of washiTapeOutlineCases) {
      expect(svg).toContain(`data-washi-outline="${outline}"`);
    }

    expect(svg).not.toContain("NaN");
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
    const sticker = createStickerLayer({ id: "sticker_2", stickerId: "noto:star" });
    const washiTape = createWashiTapeLayer({ assetId: "asset_2", id: "washi_1" });
    const document = createPageDocument({
      layers: [photo, text, embellishment, sticker, washiTape],
    });
    const svg = renderPageDocumentSvg(document, {
      resolvePhotoHref: (layer) => `/assets/${layer.assetId}/content`,
      resolveStickerSvg: () => ({
        body: '<circle cx="50" cy="50" r="40" fill="#f4bd3f" />',
        viewBox: "0 0 100 100",
      }),
      resolveWashiTapeHref: (layer) => `/assets/${layer.assetId}/content`,
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain("photo_clip_0");
    expect(svg).toContain("Family &amp; friends");
    expect(svg).toContain("/assets/asset_1/content");
    expect(svg).toContain("/assets/asset_2/content");
    expect(svg).toContain("washi_pattern_4");
    expect(svg).toContain('data-washi-outline="torn"');
    expect(svg).toContain('stroke-opacity="0.34"');
    expect(svg).toContain('fill="#f4bd3f"');
  });

  it("can omit the canvas background from SVG output", () => {
    const document = createPageDocument({
      canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
    });
    const svg = renderPageDocumentSvg(document, { includeBackground: false });

    expect(svg).not.toContain('fill="#f7f1e4"');
    expect(svg).not.toContain('<rect width="100%" height="100%"');
  });

  it("renders bundled editor fonts as SVG paths", () => {
    const text = createTextLayer({
      fontFamily: loveYaLikeASisterFontFamily,
      id: "text_1",
      text: "Playful",
    });
    const document = createPageDocument({ layers: [text] });
    const svg = renderPageDocumentSvg(document);

    expect(editorFontDefinitions).toContainEqual(
      expect.objectContaining({ family: loveYaLikeASisterFontFamily }),
    );
    expect(svg).toContain('data-layer-id="text_1"');
    expect(svg).toContain(`data-font-family="${loveYaLikeASisterFontFamily}"`);
    expect(svg).toContain("<path");
    expect(svg).not.toContain("Playful");
  });

  it("keeps bundled text path geometry stable when moving layers", () => {
    const text = createTextLayer({
      fontFamily: loveYaLikeASisterFontFamily,
      id: "text_1",
      text: "Move me",
      x: 120,
      y: 180,
    });
    const movedText = createTextLayer({ ...text, x: 360, y: 420 });
    const pathDataPattern = /<path d="([^"]+)" \/>/;
    const svg = renderPageDocumentSvg(createPageDocument({ layers: [text] }));
    const movedSvg = renderPageDocumentSvg(createPageDocument({ layers: [movedText] }));

    expect(svg.match(pathDataPattern)?.[1]).toBe(movedSvg.match(pathDataPattern)?.[1]);
    expect(svg).toContain('transform="translate(120 180)"');
    expect(movedSvg).toContain('transform="translate(360 420)"');
  });

  it("renders script font glyphs as separate paths", () => {
    const pacifico = createTextLayer({
      fontFamily: "Pacifico",
      fontSize: 180,
      id: "text_1",
      text: "New text",
    });
    const monteCarlo = createTextLayer({
      fontFamily: "Monte Carlo",
      fontSize: 180,
      id: "text_2",
      text: "New text",
    });
    const pacificoSvg = renderPageDocumentSvg(createPageDocument({ layers: [pacifico] }));
    const monteCarloSvg = renderPageDocumentSvg(createPageDocument({ layers: [monteCarlo] }));

    expect(pacificoSvg).toContain('data-font-family="Pacifico"');
    expect(pacificoSvg.match(/<path /g)).toHaveLength(7);
    expect(pacificoSvg).not.toContain("NaN");
    expect(monteCarloSvg).toContain('data-font-family="Monte Carlo"');
    expect(monteCarloSvg.match(/<path /g)).toHaveLength(7);
    expect(monteCarloSvg).not.toContain("NaN");
  });

  it("exposes Google Fonts loose-match entries", () => {
    const googleFontDefinitions = editorFontDefinitions.filter((fontDefinition) =>
      fontDefinition.id.startsWith("google-"),
    );

    expect(googleFontDefinitions).toHaveLength(53);
    expect(googleFontDefinitions).toContainEqual(
      expect.objectContaining({
        family: loveYaLikeASisterFontFamily,
        googleFamily: loveYaLikeASisterFontFamily,
        matchKind: "exact",
      }),
    );
    expect(googleFontDefinitions).toContainEqual(
      expect.objectContaining({
        family: "Caslon Bold",
        googleFamily: "Libre Caslon Text",
        matchKind: "near",
      }),
    );
    expect(googleFontDefinitions).toContainEqual(
      expect.objectContaining({
        family: "Helvetica Neue",
        googleFamily: "Roboto",
        matchKind: "substitute",
      }),
    );
    expect(editorFontFaceCss).toContain("font-family:'Caslon Bold'");
    expect(editorFontFaceCss).toContain("data:font/truetype;base64");
    expect(editorFontFaceCss).not.toContain("fonts.gstatic.com");

    const text = createTextLayer({
      fontFamily: "Caslon Bold",
      id: "text_1",
      text: "Bundled Google font",
    });
    const svg = renderPageDocumentSvg(createPageDocument({ layers: [text] }));

    expect(svg).toContain('data-font-family="Caslon Bold"');
    expect(svg).toContain("<path");
    expect(svg).not.toContain("Bundled Google font");
  });

  it("renders photo frame presets as visible frame geometry", () => {
    const matPhoto = createPhotoLayer({
      assetId: "asset_mat",
      id: "photo_mat",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      border: { color: "#ffffff", framePreset: "mat", radius: 0, style: "solid", width: 0 },
    });
    const document = createPageDocument({
      canvas: { width: 1600, height: 400 },
      layers: [
        matPhoto,
        createPhotoLayer({
          assetId: "asset_polaroid",
          id: "photo_polaroid",
          x: 400,
          y: 0,
          width: 400,
          height: 400,
          border: {
            color: "#ffffff",
            framePreset: "polaroid",
            radius: 0,
            style: "solid",
            width: 0,
          },
        }),
        createPhotoLayer({
          assetId: "asset_film",
          id: "photo_film",
          x: 800,
          y: 0,
          width: 400,
          height: 400,
          border: { color: "#ffffff", framePreset: "film", radius: 0, style: "solid", width: 0 },
        }),
        createPhotoLayer({
          assetId: "asset_paper",
          id: "photo_paper",
          x: 1200,
          y: 0,
          width: 400,
          height: 400,
          border: { color: "#ffffff", framePreset: "paper", radius: 0, style: "solid", width: 0 },
        }),
      ],
    });
    const svg = renderPageDocumentSvg(document, {
      resolvePhotoHref: (layer) => `/assets/${layer.assetId}/content`,
    });

    expect(getPhotoFrameLayout(matPhoto).image).toMatchObject({
      height: 320,
      width: 320,
      x: 40,
      y: 40,
    });
    expect(svg).toContain('data-frame-preset="mat"');
    expect(svg).toContain('data-frame-preset="polaroid"');
    expect(svg).toContain('data-frame-detail="polaroid-caption"');
    expect(svg).toContain('data-frame-preset="film"');
    expect(svg).toContain('data-frame-detail="film-sprocket"');
    expect(svg).toContain('data-frame-preset="paper"');
    expect(svg).toContain('data-frame-detail="paper-fiber"');
  });

  it("prefixes reusable SVG ids for pages rendered in the same DOM", () => {
    const photo = createPhotoLayer({ assetId: "asset_1", id: "photo_1" });
    const document = createPageDocument({ layers: [photo] });
    const svg = renderPageDocumentSvg(document, {
      idPrefix: "canvas:page-1",
      resolvePhotoHref: (layer) => `/assets/${layer.assetId}/content`,
    });

    expect(svg).toContain('id="canvas_page-1_photo_clip_0"');
    expect(svg).toContain('clip-path="url(#canvas_page-1_photo_clip_0)"');
  });

  it("groups the first and last ordered book pages into a cover spread by default", () => {
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
        rightPageId: "page_3",
        pageIds: ["page_0", "page_3"],
      },
      {
        spreadIndex: 1,
        kind: "facing",
        leftPageId: "page_1",
        rightPageId: "page_2",
        pageIds: ["page_1", "page_2"],
      },
    ]);
  });

  it("keeps an unpaired interior book page as a single real page", () => {
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
        rightPageId: "page_2",
        pageIds: ["page_0", "page_2"],
      },
      {
        spreadIndex: 1,
        kind: "single",
        leftPageId: "page_1",
        rightPageId: null,
        pageIds: ["page_1"],
      },
    ]);
  });

  it("breaks the cover spread into single first and last pages", () => {
    const spreads = createBookSpreads(
      [
        { pageId: "page_3", sortOrder: 3 },
        { pageId: "page_0", sortOrder: 0 },
        { pageId: "page_2", sortOrder: 2 },
        { pageId: "page_1", sortOrder: 1 },
      ],
      { coverSpreadEnabled: false },
    );

    expect(spreads).toEqual([
      {
        spreadIndex: 0,
        kind: "single",
        leftPageId: "page_0",
        rightPageId: null,
        pageIds: ["page_0"],
      },
      {
        spreadIndex: 1,
        kind: "facing",
        leftPageId: "page_1",
        rightPageId: "page_2",
        pageIds: ["page_1", "page_2"],
      },
      {
        spreadIndex: 2,
        kind: "single",
        leftPageId: "page_3",
        rightPageId: null,
        pageIds: ["page_3"],
      },
    ]);
  });
});
