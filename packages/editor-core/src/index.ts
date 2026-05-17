import { z } from "zod";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const layerIdSchema = z.string().min(1).max(160);
const layerNameSchema = z.string().min(1).max(120);
const coordinateSchema = z.number().finite();
const positiveSizeSchema = z.number().finite().positive();
const opacitySchema = z.number().finite().min(0).max(1);
const rotationSchema = z.number().finite().min(-360).max(360);
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
      scale: z.number().finite().min(0.1).max(5),
      rotation: rotationSchema,
      flipX: z.boolean(),
      flipY: z.boolean(),
      offsetX: z.number().finite().min(-1).max(1),
      offsetY: z.number().finite().min(-1).max(1),
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
