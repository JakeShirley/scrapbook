import { z } from "zod";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const layerIdSchema = z.string().min(1).max(160);
const layerNameSchema = z.string().min(1).max(120);
const coordinateSchema = z.number().finite();
const positiveSizeSchema = z.number().finite().positive();
const opacitySchema = z.number().finite().min(0).max(1);
const rotationSchema = z.number().finite().min(-360).max(360);

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
});

export const textLayerSchema = pageLayerBaseSchema.extend({
  kind: z.literal("text"),
  text: z.string().max(2000),
  fontFamily: z.string().min(1).max(120),
  fontSize: z.number().finite().min(6).max(240),
  color: colorSchema,
  align: z.enum(["left", "center", "right"]),
});

export const pageLayerSchema = z.discriminatedUnion("kind", [photoLayerSchema, textLayerSchema]);

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
export type PageLayerKind = PageLayer["kind"];

export type CreatePageDocumentInput = {
  canvas?: Partial<PageDocument["canvas"]>;
  layers?: PageLayer[];
};

export type CreatePhotoLayerInput = Partial<
  Pick<
    PhotoLayer,
    "fit" | "height" | "id" | "locked" | "name" | "opacity" | "rotation" | "width" | "x" | "y"
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
