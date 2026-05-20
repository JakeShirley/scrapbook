import { z } from "zod";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const layerIdSchema = z.string().min(1).max(160);
const layerNameSchema = z.string().min(1).max(120);
const roundToNearestTenth = (value: number): number => {
  const rounded = Math.round(value * 10) / 10;

  return Object.is(rounded, -0) ? 0 : rounded;
};
const coordinateSchema = z.number().finite().transform(roundToNearestTenth);
const positiveSizeSchema = z
  .number()
  .finite()
  .positive()
  .transform(roundToNearestTenth)
  .pipe(z.number().positive());
const opacitySchema = z.number().finite().min(0).max(1);
const rotationSchema = z.number().finite().min(-360).max(360).transform(roundToNearestTenth);
const cropCoordinateSchema = z.number().finite().min(0).max(1);
const cropSizeSchema = z.number().finite().min(0.05).max(1);

const defaultPhotoTransform = {
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  offsetX: 0,
  offsetY: 0,
};

const defaultPhotoCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  aspectRatioPreset: "free" as const,
};

const defaultPhotoBorder = {
  width: 0,
  color: "#ffffff",
  radius: 0,
  style: "solid" as const,
  framePreset: "none" as const,
};

const defaultPhotoShadow = {
  enabled: false,
  color: "#202426",
  opacity: 0.2,
  offsetX: 0,
  offsetY: 12,
  blur: 24,
  spread: 0,
};

const defaultPhotoMask = {
  shape: "rectangle" as const,
  inset: 0,
  feather: 0,
};

const defaultPhotoFilter = {
  preset: "none" as const,
  brightness: 1,
  contrast: 1,
  saturation: 1,
};

const pageLayerBaseSchema = z.object({
  id: layerIdSchema,
  name: layerNameSchema,
  x: coordinateSchema,
  y: coordinateSchema,
  width: positiveSizeSchema,
  height: positiveSizeSchema,
  rotation: rotationSchema,
  opacity: opacitySchema,
  locked: z.boolean(),
});

export const photoLayerSchema = pageLayerBaseSchema.extend({
  kind: z.literal("photo"),
  assetId: z.string().min(1),
  fit: z.enum(["cover", "contain"]),
  photoTransform: z
    .object({
      scale: z.number().finite().min(0.1).max(5).transform(roundToNearestTenth),
      rotation: rotationSchema,
      flipX: z.boolean(),
      flipY: z.boolean(),
      offsetX: z.number().finite().min(-1).max(1).transform(roundToNearestTenth),
      offsetY: z.number().finite().min(-1).max(1).transform(roundToNearestTenth),
    })
    .default(defaultPhotoTransform),
  crop: z
    .object({
      x: cropCoordinateSchema,
      y: cropCoordinateSchema,
      width: cropSizeSchema,
      height: cropSizeSchema,
      aspectRatioPreset: z.enum(["free", "original", "square", "portrait", "landscape"]),
    })
    .refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, {
      message: "Crop must stay within the original photo bounds",
    })
    .default(defaultPhotoCrop),
  border: z
    .object({
      width: z.number().finite().min(0).max(160),
      color: colorSchema,
      radius: z.number().finite().min(0).max(1000),
      style: z.enum(["solid", "dashed", "dotted"]),
      framePreset: z.enum(["none", "mat", "polaroid", "film", "paper"]),
    })
    .default(defaultPhotoBorder),
  shadow: z
    .object({
      enabled: z.boolean(),
      color: colorSchema,
      opacity: opacitySchema,
      offsetX: z.number().finite().min(-400).max(400),
      offsetY: z.number().finite().min(-400).max(400),
      blur: z.number().finite().min(0).max(400),
      spread: z.number().finite().min(-120).max(160),
    })
    .default(defaultPhotoShadow),
  mask: z
    .object({
      shape: z.enum(["rectangle", "ellipse", "arch", "diamond", "ticket"]),
      inset: z.number().finite().min(0).max(0.45),
      feather: z.number().finite().min(0).max(80),
    })
    .default(defaultPhotoMask),
  filter: z
    .object({
      preset: z.enum(["none", "warm", "cool", "mono", "fade", "sepia"]),
      brightness: z.number().finite().min(0.2).max(2),
      contrast: z.number().finite().min(0.2).max(2),
      saturation: z.number().finite().min(0).max(3),
    })
    .default(defaultPhotoFilter),
});

export const textLayerSchema = pageLayerBaseSchema.extend({
  kind: z.literal("text"),
  text: z.string().max(2000),
  fontFamily: z.string().min(1).max(120),
  fontSize: z.number().finite().min(6).max(240),
  color: colorSchema,
  align: z.enum(["left", "center", "right"]),
});

export const embellishmentLayerSchema = pageLayerBaseSchema.extend({
  kind: z.literal("embellishment"),
  element: z.enum(["sticker-star", "paper-label", "washi-tape", "photo-corner", "pattern-paper"]),
  color: colorSchema,
  accentColor: colorSchema,
  label: z.string().max(80),
});

export const pageLayerSchema = z.discriminatedUnion("kind", [
  photoLayerSchema,
  textLayerSchema,
  embellishmentLayerSchema,
]);

export const pageDocumentSchema = z.object({
  version: z.literal(1),
  canvas: z.object({
    width: z.number().int().min(320).max(10000),
    height: z.number().int().min(320).max(10000),
    backgroundColor: colorSchema,
  }),
  layers: z.array(pageLayerSchema).max(200),
});

export type PageDocument = z.infer<typeof pageDocumentSchema>;
export type PageLayer = z.infer<typeof pageLayerSchema>;
export type PhotoLayer = z.infer<typeof photoLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type EmbellishmentLayer = z.infer<typeof embellishmentLayerSchema>;
export type PageLayerKind = PageLayer["kind"];

export type RenderPageSvgOptions = {
  resolvePhotoHref?: (layer: PhotoLayer) => string | null | undefined;
};

export type OrderedBookPage = {
  pageId: string;
  sortOrder: number;
};

export type BookSpread = {
  spreadIndex: number;
  kind: "facing" | "single";
  leftPageId: string | null;
  rightPageId: string | null;
  pageIds: string[];
};

export type CreatePageDocumentInput = {
  canvas?: Partial<PageDocument["canvas"]>;
  layers?: PageLayer[];
};

export type CreatePhotoLayerInput = Partial<
  Pick<
    PhotoLayer,
    | "border"
    | "crop"
    | "filter"
    | "fit"
    | "height"
    | "id"
    | "locked"
    | "mask"
    | "name"
    | "opacity"
    | "photoTransform"
    | "rotation"
    | "shadow"
    | "width"
    | "x"
    | "y"
  >
> & {
  assetId: string;
};

export type CreateTextLayerInput = Partial<
  Pick<
    TextLayer,
    | "align"
    | "color"
    | "fontFamily"
    | "fontSize"
    | "height"
    | "id"
    | "locked"
    | "name"
    | "opacity"
    | "rotation"
    | "width"
    | "x"
    | "y"
  >
> & {
  text: string;
};

export type CreateEmbellishmentLayerInput = Partial<
  Pick<
    EmbellishmentLayer,
    | "accentColor"
    | "color"
    | "element"
    | "height"
    | "id"
    | "label"
    | "locked"
    | "name"
    | "opacity"
    | "rotation"
    | "width"
    | "x"
    | "y"
  >
>;

const createLayerId = (): string => `layer_${crypto.randomUUID()}`;

const parseDocument = (document: PageDocument): PageDocument => pageDocumentSchema.parse(document);

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const layerTransform = (layer: PageLayer): string => {
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;

  return `rotate(${layer.rotation} ${centerX} ${centerY})`;
};

const layerPoint = (layer: Pick<PageLayer, "height" | "width" | "x" | "y">, x: number, y: number) =>
  `${layer.x + layer.width * x},${layer.y + layer.height * y}`;

const layerPolygon = (
  layer: Pick<PageLayer, "height" | "width" | "x" | "y">,
  points: Array<[number, number]>,
) => points.map(([x, y]) => layerPoint(layer, x, y)).join(" ");

const photoClipPath = (layer: PhotoLayer, clipId: string): string => {
  const inset = layer.mask.inset;

  switch (layer.mask.shape) {
    case "rectangle":
      return `<clipPath id="${clipId}"><rect x="${layer.x + layer.width * inset}" y="${layer.y + layer.height * inset}" width="${layer.width * (1 - inset * 2)}" height="${layer.height * (1 - inset * 2)}" rx="${layer.border.radius}" /></clipPath>`;
    case "ellipse":
      return `<clipPath id="${clipId}"><ellipse cx="${layer.x + layer.width / 2}" cy="${layer.y + layer.height / 2}" rx="${layer.width * (0.5 - inset)}" ry="${layer.height * (0.5 - inset)}" /></clipPath>`;
    case "arch":
      return `<clipPath id="${clipId}"><polygon points="${layerPolygon(layer, [
        [inset, 1],
        [inset, 0.36],
        [0.18, 0.08],
        [0.5, 0],
        [0.82, 0.08],
        [1 - inset, 0.36],
        [1 - inset, 1],
      ])}" /></clipPath>`;
    case "diamond":
      return `<clipPath id="${clipId}"><polygon points="${layerPolygon(layer, [
        [0.5, inset],
        [1 - inset, 0.5],
        [0.5, 1 - inset],
        [inset, 0.5],
      ])}" /></clipPath>`;
    case "ticket":
      return `<clipPath id="${clipId}"><polygon points="${layerPolygon(layer, [
        [inset, inset],
        [0.42, inset],
        [0.5, 0.1],
        [0.58, inset],
        [1 - inset, inset],
        [1 - inset, 0.42],
        [0.9, 0.5],
        [1 - inset, 0.58],
        [1 - inset, 1 - inset],
        [0.58, 1 - inset],
        [0.5, 0.9],
        [0.42, 1 - inset],
        [inset, 1 - inset],
        [inset, 0.58],
        [0.1, 0.5],
        [inset, 0.42],
      ])}" /></clipPath>`;
  }
};

const renderTextLayerSvg = (layer: TextLayer): string => {
  const lines = layer.text.split(/\r?\n/).slice(0, 20);
  const lineHeight = layer.fontSize * 1.2;
  const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const x =
    layer.align === "center"
      ? layer.x + layer.width / 2
      : layer.align === "right"
        ? layer.x + layer.width
        : layer.x;

  return `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}"><text x="${x}" y="${layer.y + layer.fontSize}" fill="${escapeXml(layer.color)}" font-family="${escapeXml(layer.fontFamily)}" font-size="${layer.fontSize}" text-anchor="${anchor}">${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("")}</text></g>`;
};

const renderPhotoLayerSvg = (
  layer: PhotoLayer,
  href: string | null | undefined,
  index: number,
): { body: string; defs: string } | null => {
  if (!href) {
    return null;
  }

  const clipId = `photo_clip_${index}`;
  const frameInset = layer.border.width / 2;
  const imageWidth = layer.width / Math.max(layer.crop.width, 0.05);
  const imageHeight = layer.height / Math.max(layer.crop.height, 0.05);
  const imageX =
    layer.x - layer.crop.x * imageWidth + layer.photoTransform.offsetX * imageWidth * 0.5;
  const imageY =
    layer.y - layer.crop.y * imageHeight + layer.photoTransform.offsetY * imageHeight * 0.5;
  const imageCenterX = layer.x + layer.width / 2;
  const imageCenterY = layer.y + layer.height / 2;
  const scaleX = layer.photoTransform.flipX
    ? -layer.photoTransform.scale
    : layer.photoTransform.scale;
  const scaleY = layer.photoTransform.flipY
    ? -layer.photoTransform.scale
    : layer.photoTransform.scale;

  return {
    defs: photoClipPath(layer, clipId),
    body: `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${layer.border.radius}" fill="${escapeXml(layer.border.color)}" opacity="${layer.border.width > 0 ? 1 : 0}" /><image href="${escapeXml(href)}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid ${layer.fit === "cover" ? "slice" : "meet"}" clip-path="url(#${clipId})" transform="translate(${imageCenterX} ${imageCenterY}) rotate(${layer.photoTransform.rotation}) scale(${scaleX} ${scaleY}) translate(${-imageCenterX} ${-imageCenterY})" /><rect x="${layer.x + frameInset}" y="${layer.y + frameInset}" width="${Math.max(0, layer.width - layer.border.width)}" height="${Math.max(0, layer.height - layer.border.width)}" rx="${layer.border.radius}" fill="none" stroke="${escapeXml(layer.border.color)}" stroke-width="${layer.border.width}" stroke-dasharray="${layer.border.style === "dashed" ? "24 18" : layer.border.style === "dotted" ? "4 14" : ""}" /></g>`,
  };
};

const renderEmbellishmentLayerSvg = (layer: EmbellishmentLayer): string => {
  const label = escapeXml(layer.label);
  const labelText = `<text x="${layer.x + layer.width / 2}" y="${layer.y + layer.height / 2}" dominant-baseline="middle" text-anchor="middle" fill="#202426" font-family="Inter, sans-serif" font-size="${Math.max(24, Math.min(96, layer.height / 3))}" font-weight="700">${label}</text>`;
  const fill = escapeXml(layer.color);
  const accent = escapeXml(layer.accentColor);
  let body: string;

  switch (layer.element) {
    case "sticker-star":
      body = `<polygon points="${layerPolygon(layer, [
        [0.5, 0],
        [0.61, 0.32],
        [0.95, 0.32],
        [0.68, 0.52],
        [0.78, 0.87],
        [0.5, 0.66],
        [0.22, 0.87],
        [0.32, 0.52],
        [0.05, 0.32],
        [0.39, 0.32],
      ])}" fill="${fill}" />${label ? labelText : ""}`;
      break;
    case "paper-label":
      body = `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="8" fill="${fill}" stroke="${accent}" stroke-width="8" /><rect x="${layer.x + 16}" y="${layer.y + 16}" width="${Math.max(0, layer.width - 32)}" height="${Math.max(0, layer.height - 32)}" rx="4" fill="none" stroke="#ffffff" stroke-opacity="0.48" stroke-width="5" />${labelText}`;
      break;
    case "washi-tape": {
      const stripes: string[] = [];

      for (let offset = -layer.height; offset < layer.width + layer.height; offset += 32) {
        stripes.push(
          `<path d="M ${layer.x + offset} ${layer.y + layer.height} L ${layer.x + offset + layer.height} ${layer.y}" stroke="#ffffff" stroke-opacity="0.34" stroke-width="12" />`,
        );
      }

      body = `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="4" fill="${fill}" />${stripes.join("")}${label ? labelText : ""}`;
      break;
    }
    case "photo-corner":
      body = `<polygon points="${layerPoint(layer, 0, 0)} ${layerPoint(layer, 0.42, 0)} ${layerPoint(layer, 0, 0.42)}" fill="${fill}" /><polygon points="${layerPoint(layer, 1, 1)} ${layerPoint(layer, 0.58, 1)} ${layerPoint(layer, 1, 0.58)}" fill="${accent}" />${label ? labelText : ""}`;
      break;
    case "pattern-paper": {
      const dots: string[] = [];
      const dotSpacing = 22;

      for (let centerY = layer.y + 8; centerY < layer.y + layer.height; centerY += dotSpacing) {
        for (let centerX = layer.x + 8; centerX < layer.x + layer.width; centerX += dotSpacing) {
          dots.push(`<circle cx="${centerX}" cy="${centerY}" r="3" fill="${accent}" />`);
        }
      }

      body = `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" fill="${fill}" stroke="#202426" stroke-opacity="0.15" />${dots.join("")}${label ? labelText : ""}`;
      break;
    }
  }

  return `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}">${body}</g>`;
};

export const renderPageDocumentSvg = (
  document: PageDocument,
  options: RenderPageSvgOptions = {},
): string => {
  const parsedDocument = pageDocumentSchema.parse(document);
  const defs: string[] = [];
  const bodies: string[] = [];

  for (const [index, layer] of parsedDocument.layers.entries()) {
    if (layer.kind === "photo") {
      const rendered = renderPhotoLayerSvg(layer, options.resolvePhotoHref?.(layer), index);

      if (rendered) {
        defs.push(rendered.defs);
        bodies.push(rendered.body);
      }

      continue;
    }

    bodies.push(
      layer.kind === "text" ? renderTextLayerSvg(layer) : renderEmbellishmentLayerSvg(layer),
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${parsedDocument.canvas.width}" height="${parsedDocument.canvas.height}" viewBox="0 0 ${parsedDocument.canvas.width} ${parsedDocument.canvas.height}"><defs>${defs.join("")}</defs><rect width="100%" height="100%" fill="${escapeXml(parsedDocument.canvas.backgroundColor)}" />${bodies.join("")}</svg>`;
};

export const createPageDocument = (input: CreatePageDocumentInput = {}): PageDocument =>
  pageDocumentSchema.parse({
    version: 1,
    canvas: {
      width: input.canvas?.width ?? 2400,
      height: input.canvas?.height ?? 3000,
      backgroundColor: input.canvas?.backgroundColor ?? "#fffdf7",
    },
    layers: input.layers ?? [],
  });

export const createPhotoLayer = (input: CreatePhotoLayerInput): PhotoLayer =>
  photoLayerSchema.parse({
    id: input.id ?? createLayerId(),
    kind: "photo",
    name: input.name ?? "Photo",
    assetId: input.assetId,
    x: input.x ?? 240,
    y: input.y ?? 240,
    width: input.width ?? 960,
    height: input.height ?? 720,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    locked: input.locked ?? false,
    fit: input.fit ?? "cover",
    photoTransform: input.photoTransform ?? defaultPhotoTransform,
    crop: input.crop ?? defaultPhotoCrop,
    border: input.border ?? defaultPhotoBorder,
    shadow: input.shadow ?? defaultPhotoShadow,
    mask: input.mask ?? defaultPhotoMask,
    filter: input.filter ?? defaultPhotoFilter,
  });

export const createTextLayer = (input: CreateTextLayerInput): TextLayer =>
  textLayerSchema.parse({
    id: input.id ?? createLayerId(),
    kind: "text",
    name: input.name ?? "Text",
    text: input.text,
    x: input.x ?? 240,
    y: input.y ?? 1080,
    width: input.width ?? 960,
    height: input.height ?? 180,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    locked: input.locked ?? false,
    fontFamily: input.fontFamily ?? "Inter, sans-serif",
    fontSize: input.fontSize ?? 72,
    color: input.color ?? "#202426",
    align: input.align ?? "left",
  });

export const createEmbellishmentLayer = (
  input: CreateEmbellishmentLayerInput = {},
): EmbellishmentLayer =>
  embellishmentLayerSchema.parse({
    id: input.id ?? createLayerId(),
    kind: "embellishment",
    name: input.name ?? "Embellishment",
    x: input.x ?? 320,
    y: input.y ?? 320,
    width: input.width ?? 420,
    height: input.height ?? 220,
    rotation: input.rotation ?? -4,
    opacity: input.opacity ?? 1,
    locked: input.locked ?? false,
    element: input.element ?? "sticker-star",
    color: input.color ?? "#d6a537",
    accentColor: input.accentColor ?? "#24766e",
    label: input.label ?? "",
  });

export const resetPhotoLayerEdits = (layer: PhotoLayer): PhotoLayer =>
  photoLayerSchema.parse({
    ...layer,
    fit: "cover",
    photoTransform: defaultPhotoTransform,
    crop: defaultPhotoCrop,
    border: defaultPhotoBorder,
    shadow: defaultPhotoShadow,
    mask: defaultPhotoMask,
    filter: defaultPhotoFilter,
  });

export const addLayer = (
  document: PageDocument,
  layer: PageLayer,
  insertIndex = document.layers.length,
): PageDocument => {
  const parsedDocument = parseDocument(document);
  const parsedLayer = pageLayerSchema.parse(layer);
  const nextLayers = [...parsedDocument.layers];
  const boundedIndex = Math.max(0, Math.min(insertIndex, nextLayers.length));

  nextLayers.splice(boundedIndex, 0, parsedLayer);

  return parseDocument({ ...parsedDocument, layers: nextLayers });
};

export const updateLayer = (
  document: PageDocument,
  layerId: string,
  update: Partial<PageLayer>,
): PageDocument => {
  const parsedDocument = parseDocument(document);
  const nextLayers = parsedDocument.layers.map((layer) =>
    layer.id === layerId ? pageLayerSchema.parse({ ...layer, ...update, id: layer.id }) : layer,
  );

  return parseDocument({ ...parsedDocument, layers: nextLayers });
};

export const deleteLayer = (document: PageDocument, layerId: string): PageDocument => {
  const parsedDocument = parseDocument(document);

  return parseDocument({
    ...parsedDocument,
    layers: parsedDocument.layers.filter((layer) => layer.id !== layerId),
  });
};

export const reorderLayer = (
  document: PageDocument,
  layerId: string,
  toIndex: number,
): PageDocument => {
  const parsedDocument = parseDocument(document);
  const fromIndex = parsedDocument.layers.findIndex((layer) => layer.id === layerId);

  if (fromIndex === -1) {
    return parsedDocument;
  }

  const nextLayers = [...parsedDocument.layers];
  const [layer] = nextLayers.splice(fromIndex, 1);

  if (!layer) {
    return parsedDocument;
  }

  const boundedIndex = Math.max(0, Math.min(toIndex, nextLayers.length));
  nextLayers.splice(boundedIndex, 0, layer);

  return parseDocument({ ...parsedDocument, layers: nextLayers });
};

export const duplicateLayer = (
  document: PageDocument,
  layerId: string,
  newLayerId = createLayerId(),
): PageDocument => {
  const parsedDocument = parseDocument(document);
  const layerIndex = parsedDocument.layers.findIndex((layer) => layer.id === layerId);
  const layer = parsedDocument.layers[layerIndex];

  if (!layer) {
    return parsedDocument;
  }

  const duplicate = pageLayerSchema.parse({
    ...layer,
    id: newLayerId,
    name: `${layer.name} copy`,
    x: layer.x + 80,
    y: layer.y + 80,
  });

  return addLayer(parsedDocument, duplicate, layerIndex + 1);
};

export const updateCanvas = (
  document: PageDocument,
  canvas: Partial<PageDocument["canvas"]>,
): PageDocument => {
  const parsedDocument = parseDocument(document);

  return parseDocument({
    ...parsedDocument,
    canvas: { ...parsedDocument.canvas, ...canvas },
  });
};

export const resizePageDocument = (
  document: PageDocument,
  canvas: Pick<PageDocument["canvas"], "height" | "width">,
): PageDocument => {
  const parsedDocument = parseDocument(document);
  const scaleX = canvas.width / parsedDocument.canvas.width;
  const scaleY = canvas.height / parsedDocument.canvas.height;
  const textScale = Math.min(scaleX, scaleY);

  return parseDocument({
    ...parsedDocument,
    canvas: { ...parsedDocument.canvas, ...canvas },
    layers: parsedDocument.layers.map((layer) =>
      pageLayerSchema.parse({
        ...layer,
        x: layer.x * scaleX,
        y: layer.y * scaleY,
        width: layer.width * scaleX,
        height: layer.height * scaleY,
        ...(layer.kind === "text" ? { fontSize: layer.fontSize * textScale } : {}),
      }),
    ),
  });
};

export const createBookSpreads = (pages: OrderedBookPage[]): BookSpread[] => {
  const sortedPages = [...pages].sort((first, second) => first.sortOrder - second.sortOrder);

  return sortedPages.reduce<BookSpread[]>((spreads, page, index) => {
    const spreadIndex = Math.floor(index / 2);
    const isLeftPage = index % 2 === 0;

    if (isLeftPage) {
      spreads.push({
        spreadIndex,
        kind: "single",
        leftPageId: page.pageId,
        rightPageId: null,
        pageIds: [page.pageId],
      });

      return spreads;
    }

    const spread = spreads[spreads.length - 1];

    if (!spread) {
      return spreads;
    }

    spread.kind = "facing";
    spread.rightPageId = page.pageId;
    spread.pageIds = [spread.leftPageId, page.pageId].filter((pageId): pageId is string =>
      Boolean(pageId),
    );

    return spreads;
  }, []);
};
