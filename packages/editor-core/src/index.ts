import type { Font, Path, PathCommand } from "opentype.js";
import { z } from "zod";

import { defaultTextFontFamily, getBundledEditorFont } from "./fonts.js";

export {
  defaultTextFontFamily,
  type EditorFontDefinition,
  type EditorFontId,
  editorFontDefinitions,
  editorFontFaceCss,
  getEditorFontByFamily,
  loveYaLikeASisterFontFamily,
} from "./fonts.js";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const layerIdSchema = z.string().min(1).max(160);
const roundToNearestTenth = (value: number): number => {
  const rounded = Math.round(value * 10) / 10;

  return Object.is(rounded, -0) ? 0 : rounded;
};
const roundToNearestHundredth = (value: number): number => {
  const rounded = Math.round(value * 100) / 100;

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

const defaultTextStroke = {
  enabled: false,
  color: "#ffffff",
  width: 8,
};

const defaultTextShadow = {
  enabled: false,
  color: "#202426",
  opacity: 0.3,
  offsetX: 12,
  offsetY: 12,
  blur: 12,
};

const defaultTextGlow = {
  enabled: false,
  color: "#ffffff",
  opacity: 0.7,
  blur: 18,
};

const defaultTextBackground = {
  enabled: false,
  color: "#fffdf7",
  opacity: 0.9,
  padding: 12,
  radius: 10,
};

const defaultWashiTapeTile = {
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
};

const washiTapeTileBaseSize = 80;

const defaultWashiTapePattern = {
  kind: "polkaDot" as const,
  primaryColor: "#fffdf7",
  secondaryColor: "#79a9a4",
};

const legacyPhotoWashiTapePattern = {
  ...defaultWashiTapePattern,
  kind: "customPhoto" as const,
};

export type StickerLibraryId = "noto" | "twemoji";
export type StickerId = `${StickerLibraryId}:${string}`;

const stickerIdPattern = /^(noto|twemoji):[a-z0-9]+(?:-[a-z0-9]+)*$/;

const legacyStickerIds: Record<string, StickerId> = {
  balloon: "noto:balloon",
  camera: "noto:camera",
  cupcake: "noto:cupcake",
  flower: "noto:blossom",
  "gold-star": "noto:star",
  heart: "noto:red-heart",
  "paper-clip": "noto:paperclip",
  rainbow: "noto:rainbow",
  sparkles: "noto:sparkles",
  sunshine: "noto:sun-with-face",
};

export const stickerLibrarySummaries: readonly {
  id: StickerLibraryId;
  license: string;
  name: string;
}[] = [
  { id: "noto", license: "Apache-2.0", name: "Noto Emoji" },
  { id: "twemoji", license: "CC-BY-4.0", name: "Twemoji" },
];

export const normalizeStickerId = (stickerId: string): StickerId =>
  legacyStickerIds[stickerId] ?? (stickerId as StickerId);

const isStickerId = (value: unknown): value is StickerId =>
  typeof value === "string" && stickerIdPattern.test(value);

const stickerIdSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeStickerId(value) : value),
  z.custom<StickerId>(isStickerId, "Sticker id must include a supported library prefix"),
);

export type StickerDefinition = {
  category: string;
  icon: string;
  id: StickerId;
  library: StickerLibraryId;
  libraryName: string;
  name: string;
};

export type StickerSvg = {
  body: string;
  viewBox: string;
};

const pageLayerBaseSchema = z.object({
  id: layerIdSchema,
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
  stroke: z
    .object({
      enabled: z.boolean(),
      color: colorSchema,
      width: z.number().finite().min(0).max(80),
    })
    .default(defaultTextStroke),
  shadow: z
    .object({
      enabled: z.boolean(),
      color: colorSchema,
      opacity: opacitySchema,
      offsetX: z.number().finite().min(-240).max(240),
      offsetY: z.number().finite().min(-240).max(240),
      blur: z.number().finite().min(0).max(160),
    })
    .default(defaultTextShadow),
  glow: z
    .object({
      enabled: z.boolean(),
      color: colorSchema,
      opacity: opacitySchema,
      blur: z.number().finite().min(0).max(160),
    })
    .default(defaultTextGlow),
  background: z
    .object({
      enabled: z.boolean(),
      color: colorSchema,
      opacity: opacitySchema,
      padding: z.number().finite().min(0).max(120),
      radius: z.number().finite().min(0).max(160),
    })
    .default(defaultTextBackground),
});

export const embellishmentLayerSchema = pageLayerBaseSchema.extend({
  kind: z.literal("embellishment"),
  element: z.enum(["paper-label", "washi-tape", "photo-corner", "pattern-paper"]),
  color: colorSchema,
  accentColor: colorSchema,
  label: z.string().max(80),
});

export const stickerLayerSchema = pageLayerBaseSchema.extend({
  kind: z.literal("sticker"),
  stickerId: stickerIdSchema,
});

export const washiTapeLayerSchema = pageLayerBaseSchema.extend({
  kind: z.literal("washiTape"),
  assetId: z.string().min(1).optional(),
  outline: z.enum([
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
  ]),
  pattern: z
    .object({
      kind: z.enum(["solid", "polkaDot", "stripe", "grid", "checker", "customPhoto"]),
      primaryColor: colorSchema,
      secondaryColor: colorSchema,
      assetId: z.string().min(1).optional(),
    })
    .default(legacyPhotoWashiTapePattern),
  tile: z
    .object({
      scale: z.number().finite().min(0.2).max(4).transform(roundToNearestHundredth),
      scaleX: z.number().finite().min(0.01).max(4).transform(roundToNearestHundredth).default(1),
      scaleY: z.number().finite().min(0.01).max(4).transform(roundToNearestHundredth).default(1),
      rotation: rotationSchema,
      offsetX: z.number().finite().min(-1).max(1).transform(roundToNearestHundredth),
      offsetY: z.number().finite().min(-1).max(1).transform(roundToNearestHundredth),
    })
    .default(defaultWashiTapeTile),
});

export const pageLayerSchema = z.discriminatedUnion("kind", [
  photoLayerSchema,
  textLayerSchema,
  embellishmentLayerSchema,
  stickerLayerSchema,
  washiTapeLayerSchema,
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
export type StickerLayer = z.infer<typeof stickerLayerSchema>;
export type WashiTapeLayer = z.infer<typeof washiTapeLayerSchema>;
export type PageLayerKind = PageLayer["kind"];

export type RenderPageSvgOptions = {
  idPrefix?: string;
  includeBackground?: boolean;
  resolvePhotoHref?: (layer: PhotoLayer) => string | null | undefined;
  resolveStickerSvg?: (layer: StickerLayer) => StickerSvg | null | undefined;
  resolveWashiTapeHref?: (layer: WashiTapeLayer) => string | null | undefined;
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

export type CreateBookSpreadsOptions = {
  coverSpreadEnabled?: boolean;
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
    | "glow"
    | "height"
    | "id"
    | "locked"
    | "opacity"
    | "rotation"
    | "shadow"
    | "stroke"
    | "background"
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
    | "opacity"
    | "rotation"
    | "width"
    | "x"
    | "y"
  >
>;

export type CreateStickerLayerInput = Partial<
  Pick<StickerLayer, "height" | "id" | "locked" | "opacity" | "rotation" | "width" | "x" | "y">
> & {
  stickerId?: string;
};

export type CreateWashiTapeLayerInput = Partial<
  Pick<
    WashiTapeLayer,
    | "assetId"
    | "height"
    | "id"
    | "locked"
    | "opacity"
    | "outline"
    | "pattern"
    | "rotation"
    | "width"
    | "x"
    | "y"
  >
> & {
  tile?: Partial<WashiTapeLayer["tile"]>;
};

const createRandomId = (): string => {
  try {
    const randomUuid = globalThis.crypto?.randomUUID?.() ?? null;

    if (randomUuid) {
      return randomUuid;
    }
  } catch {}

  const bytes = new Uint8Array(16);
  let hasRandomBytes = false;

  try {
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      hasRandomBytes = true;
    }
  } catch {
    hasRandomBytes = false;
  }

  if (hasRandomBytes) {
    bytes[6] = ((bytes.at(6) ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes.at(8) ?? 0) & 0x3f) | 0x80;

    const hexBytes = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

    return `${hexBytes.slice(0, 4).join("")}-${hexBytes.slice(4, 6).join("")}-${hexBytes
      .slice(6, 8)
      .join("")}-${hexBytes.slice(8, 10).join("")}-${hexBytes.slice(10, 16).join("")}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const createLayerId = (): string => `layer_${createRandomId()}`;

const parseDocument = (document: PageDocument): PageDocument => pageDocumentSchema.parse(document);

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const svgIdPart = (value: string): string => {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "_");

  return sanitized.length > 0 ? sanitized : "svg";
};

const createSvgId = (...parts: Array<number | string>): string =>
  parts.map((part) => svgIdPart(String(part))).join("_");

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

const layerPath = (
  layer: Pick<PageLayer, "height" | "width" | "x" | "y">,
  commands: string,
): string =>
  commands.replaceAll(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_match, x: string, y: string) =>
    layerPoint(layer, Number(x), Number(y)),
  );

export type PhotoFrameRect = Pick<PageLayer, "height" | "width" | "x" | "y"> & {
  radius: number;
};

export type PhotoFrameInsets = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type PhotoFrameLayout = {
  image: PhotoFrameRect;
  insets: PhotoFrameInsets;
  outer: PhotoFrameRect;
};

const minimumPhotoFrameImageSize = 1;

const roundSvgNumber = (value: number): number => {
  const rounded = Math.round(value * 10) / 10;

  return Object.is(rounded, -0) ? 0 : rounded;
};

const createPhotoFrameRect = ({ height, radius, width, x, y }: PhotoFrameRect): PhotoFrameRect => ({
  height: roundSvgNumber(Math.max(0, height)),
  radius: roundSvgNumber(Math.max(0, radius)),
  width: roundSvgNumber(Math.max(0, width)),
  x: roundSvgNumber(x),
  y: roundSvgNumber(y),
});

const constrainPhotoFrameInsets = (
  layer: PhotoLayer,
  insets: PhotoFrameInsets,
): PhotoFrameInsets => {
  const horizontalInset = insets.left + insets.right;
  const verticalInset = insets.top + insets.bottom;
  const horizontalScale =
    horizontalInset > layer.width - minimumPhotoFrameImageSize
      ? Math.max(0, layer.width - minimumPhotoFrameImageSize) / horizontalInset
      : 1;
  const verticalScale =
    verticalInset > layer.height - minimumPhotoFrameImageSize
      ? Math.max(0, layer.height - minimumPhotoFrameImageSize) / verticalInset
      : 1;

  return {
    bottom: roundSvgNumber(Math.max(0, insets.bottom * verticalScale)),
    left: roundSvgNumber(Math.max(0, insets.left * horizontalScale)),
    right: roundSvgNumber(Math.max(0, insets.right * horizontalScale)),
    top: roundSvgNumber(Math.max(0, insets.top * verticalScale)),
  };
};

const createPhotoFrameLayout = (layer: PhotoLayer, insets: PhotoFrameInsets): PhotoFrameLayout => {
  const constrainedInsets = constrainPhotoFrameInsets(layer, insets);
  const largestInset = Math.max(
    constrainedInsets.bottom,
    constrainedInsets.left,
    constrainedInsets.right,
    constrainedInsets.top,
  );
  const image = createPhotoFrameRect({
    height: Math.max(
      minimumPhotoFrameImageSize,
      layer.height - constrainedInsets.top - constrainedInsets.bottom,
    ),
    radius: Math.max(0, layer.border.radius - largestInset * 0.4),
    width: Math.max(
      minimumPhotoFrameImageSize,
      layer.width - constrainedInsets.left - constrainedInsets.right,
    ),
    x: layer.x + constrainedInsets.left,
    y: layer.y + constrainedInsets.top,
  });

  return {
    image,
    insets: constrainedInsets,
    outer: createPhotoFrameRect({
      height: layer.height,
      radius: layer.border.radius,
      width: layer.width,
      x: layer.x,
      y: layer.y,
    }),
  };
};

export const getPhotoFrameLayout = (layer: PhotoLayer): PhotoFrameLayout => {
  const minimumDimension = Math.min(layer.width, layer.height);
  const explicitWidth = layer.border.width > 0;

  switch (layer.border.framePreset) {
    case "mat": {
      const inset = explicitWidth ? layer.border.width : minimumDimension * 0.1;

      return createPhotoFrameLayout(layer, {
        bottom: inset,
        left: inset,
        right: inset,
        top: inset,
      });
    }
    case "polaroid": {
      const sideInset = explicitWidth ? layer.border.width : minimumDimension * 0.07;
      const bottomInset = explicitWidth
        ? Math.max(layer.border.width * 2.3, layer.border.width + minimumDimension * 0.04)
        : Math.max(sideInset * 2.4, layer.height * 0.18);

      return createPhotoFrameLayout(layer, {
        bottom: bottomInset,
        left: sideInset,
        right: sideInset,
        top: sideInset,
      });
    }
    case "film": {
      const sideInset = explicitWidth ? layer.border.width : minimumDimension * 0.11;
      const verticalInset = explicitWidth
        ? Math.max(layer.border.width * 0.62, minimumDimension * 0.035)
        : minimumDimension * 0.06;

      return createPhotoFrameLayout(layer, {
        bottom: verticalInset,
        left: sideInset,
        right: sideInset,
        top: verticalInset,
      });
    }
    case "paper": {
      const inset = explicitWidth ? layer.border.width : minimumDimension * 0.055;

      return createPhotoFrameLayout(layer, {
        bottom: inset,
        left: inset,
        right: inset,
        top: inset,
      });
    }
    case "none":
      return createPhotoFrameLayout(layer, { bottom: 0, left: 0, right: 0, top: 0 });
  }
};

const photoClipPath = (layer: PhotoLayer, clipId: string, imageFrame: PhotoFrameRect): string => {
  const inset = layer.mask.inset;

  switch (layer.mask.shape) {
    case "rectangle":
      return `<clipPath id="${clipId}"><rect x="${imageFrame.x + imageFrame.width * inset}" y="${imageFrame.y + imageFrame.height * inset}" width="${imageFrame.width * (1 - inset * 2)}" height="${imageFrame.height * (1 - inset * 2)}" rx="${imageFrame.radius}" /></clipPath>`;
    case "ellipse":
      return `<clipPath id="${clipId}"><ellipse cx="${imageFrame.x + imageFrame.width / 2}" cy="${imageFrame.y + imageFrame.height / 2}" rx="${imageFrame.width * (0.5 - inset)}" ry="${imageFrame.height * (0.5 - inset)}" /></clipPath>`;
    case "arch":
      return `<clipPath id="${clipId}"><polygon points="${layerPolygon(imageFrame, [
        [inset, 1],
        [inset, 0.36],
        [0.18, 0.08],
        [0.5, 0],
        [0.82, 0.08],
        [1 - inset, 0.36],
        [1 - inset, 1],
      ])}" /></clipPath>`;
    case "diamond":
      return `<clipPath id="${clipId}"><polygon points="${layerPolygon(imageFrame, [
        [0.5, inset],
        [1 - inset, 0.5],
        [0.5, 1 - inset],
        [inset, 0.5],
      ])}" /></clipPath>`;
    case "ticket":
      return `<clipPath id="${clipId}"><polygon points="${layerPolygon(imageFrame, [
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

const defaultPhotoFrameColor = "#ffffff";

const photoFrameFill = (layer: PhotoLayer): string => {
  if (
    layer.border.framePreset === "film" &&
    layer.border.color.toLowerCase() === defaultPhotoFrameColor
  ) {
    return "#202426";
  }

  if (
    layer.border.framePreset === "paper" &&
    layer.border.color.toLowerCase() === defaultPhotoFrameColor
  ) {
    return "#fffdf7";
  }

  return layer.border.color;
};

const borderStrokeDasharray = (style: PhotoLayer["border"]["style"]): string =>
  style === "dashed" ? "24 18" : style === "dotted" ? "4 14" : "";

const rectSvg = (rect: PhotoFrameRect): string =>
  `x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${rect.radius}"`;

const renderFilmSprocketHolesSvg = (layer: PhotoLayer, layout: PhotoFrameLayout): string => {
  const sideInset = Math.max(layout.insets.left, layout.insets.right);

  if (sideInset <= 0) {
    return "";
  }

  const holeWidth = Math.max(2, Math.min(sideInset * 0.42, layer.width * 0.05));
  const holeHeight = Math.max(3, Math.min(holeWidth * 1.45, layer.height * 0.1));
  const availableHeight = Math.max(1, layout.image.height);
  const holeCount = Math.max(2, Math.min(12, Math.floor(availableHeight / (holeHeight * 1.65))));
  const step = availableHeight / holeCount;
  const leftX = layer.x + Math.max(0, (layout.insets.left - holeWidth) / 2);
  const rightX =
    layer.x +
    layer.width -
    layout.insets.right +
    Math.max(0, (layout.insets.right - holeWidth) / 2);
  const holes: string[] = [];

  for (let index = 0; index < holeCount; index += 1) {
    const holeY = layout.image.y + step * index + Math.max(0, (step - holeHeight) / 2);

    holes.push(
      `<rect data-frame-detail="film-sprocket" x="${leftX}" y="${holeY}" width="${holeWidth}" height="${holeHeight}" rx="${Math.min(holeWidth, holeHeight) * 0.18}" fill="#fffdf7" opacity="0.92" />`,
      `<rect data-frame-detail="film-sprocket" x="${rightX}" y="${holeY}" width="${holeWidth}" height="${holeHeight}" rx="${Math.min(holeWidth, holeHeight) * 0.18}" fill="#fffdf7" opacity="0.92" />`,
    );
  }

  return holes.join("");
};

const renderPaperTextureSvg = (layer: PhotoLayer): string => {
  const stroke =
    layer.border.color.toLowerCase() === defaultPhotoFrameColor ? "#d8ddd8" : "#ffffff";
  const opacity = layer.border.color.toLowerCase() === defaultPhotoFrameColor ? 0.38 : 0.28;
  const strokeWidth = Math.max(1, Math.min(layer.width, layer.height) * 0.004);
  const paths = [
    `M ${layer.x + layer.width * 0.05} ${layer.y + layer.height * 0.18} C ${layer.x + layer.width * 0.24} ${layer.y + layer.height * 0.1}, ${layer.x + layer.width * 0.34} ${layer.y + layer.height * 0.24}, ${layer.x + layer.width * 0.48} ${layer.y + layer.height * 0.15}`,
    `M ${layer.x + layer.width * 0.68} ${layer.y + layer.height * 0.08} C ${layer.x + layer.width * 0.78} ${layer.y + layer.height * 0.18}, ${layer.x + layer.width * 0.84} ${layer.y + layer.height * 0.1}, ${layer.x + layer.width * 0.94} ${layer.y + layer.height * 0.2}`,
    `M ${layer.x + layer.width * 0.12} ${layer.y + layer.height * 0.86} C ${layer.x + layer.width * 0.28} ${layer.y + layer.height * 0.78}, ${layer.x + layer.width * 0.42} ${layer.y + layer.height * 0.93}, ${layer.x + layer.width * 0.58} ${layer.y + layer.height * 0.84}`,
    `M ${layer.x + layer.width * 0.72} ${layer.y + layer.height * 0.9} C ${layer.x + layer.width * 0.82} ${layer.y + layer.height * 0.82}, ${layer.x + layer.width * 0.9} ${layer.y + layer.height * 0.94}, ${layer.x + layer.width * 0.98} ${layer.y + layer.height * 0.84}`,
  ];

  return paths
    .map(
      (path) =>
        `<path data-frame-detail="paper-fiber" d="${path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}" />`,
    )
    .join("");
};

const photoSilhouetteShapeSvg = (
  layer: PhotoLayer,
  layout: PhotoFrameLayout,
  fill: string,
): string => {
  const hasVisibleFrame = layer.border.framePreset !== "none" || layer.border.width > 0;

  if (hasVisibleFrame) {
    const outer = layout.outer;

    return `<rect data-photo-shadow-shape="frame" x="${outer.x}" y="${outer.y}" width="${outer.width}" height="${outer.height}" rx="${outer.radius}" fill="${fill}" />`;
  }

  const inset = layer.mask.inset;
  const imageFrame = layout.image;
  const shapeAttribute = `data-photo-shadow-shape="mask-${layer.mask.shape}"`;

  switch (layer.mask.shape) {
    case "rectangle":
      return `<rect ${shapeAttribute} x="${imageFrame.x + imageFrame.width * inset}" y="${imageFrame.y + imageFrame.height * inset}" width="${imageFrame.width * (1 - inset * 2)}" height="${imageFrame.height * (1 - inset * 2)}" rx="${imageFrame.radius}" fill="${fill}" />`;
    case "ellipse":
      return `<ellipse ${shapeAttribute} cx="${imageFrame.x + imageFrame.width / 2}" cy="${imageFrame.y + imageFrame.height / 2}" rx="${imageFrame.width * (0.5 - inset)}" ry="${imageFrame.height * (0.5 - inset)}" fill="${fill}" />`;
    case "arch":
      return `<polygon ${shapeAttribute} points="${layerPolygon(imageFrame, [
        [inset, 1],
        [inset, 0.36],
        [0.18, 0.08],
        [0.5, 0],
        [0.82, 0.08],
        [1 - inset, 0.36],
        [1 - inset, 1],
      ])}" fill="${fill}" />`;
    case "diamond":
      return `<polygon ${shapeAttribute} points="${layerPolygon(imageFrame, [
        [0.5, inset],
        [1 - inset, 0.5],
        [0.5, 1 - inset],
        [inset, 0.5],
      ])}" fill="${fill}" />`;
    case "ticket":
      return `<polygon ${shapeAttribute} points="${layerPolygon(imageFrame, [
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
      ])}" fill="${fill}" />`;
  }
};

const renderPhotoShadowFilterSvg = (layer: PhotoLayer, filterId: string): string => {
  if (!layer.shadow.enabled || layer.shadow.opacity <= 0) {
    return "";
  }

  const blur = Math.max(0, layer.shadow.blur);
  const spread = layer.shadow.spread;
  const stdDeviation = blur / 2;
  const margin = Math.max(
    24,
    Math.abs(layer.shadow.offsetX) +
      Math.abs(layer.shadow.offsetY) +
      blur * 2 +
      Math.max(0, spread) * 2,
  );
  const parts: string[] = [];

  if (spread > 0) {
    parts.push(
      `<feMorphology in="SourceGraphic" operator="dilate" radius="${spread}" result="photo_shadow_spread" />`,
      `<feGaussianBlur in="photo_shadow_spread" stdDeviation="${stdDeviation}" />`,
    );
  } else if (spread < 0) {
    parts.push(
      `<feMorphology in="SourceGraphic" operator="erode" radius="${-spread}" result="photo_shadow_spread" />`,
      `<feGaussianBlur in="photo_shadow_spread" stdDeviation="${stdDeviation}" />`,
    );
  } else {
    parts.push(`<feGaussianBlur in="SourceGraphic" stdDeviation="${stdDeviation}" />`);
  }

  return `<filter id="${filterId}" filterUnits="userSpaceOnUse" x="${layer.x - margin}" y="${layer.y - margin}" width="${layer.width + margin * 2}" height="${layer.height + margin * 2}" color-interpolation-filters="sRGB">${parts.join("")}</filter>`;
};

const renderPhotoShadowSvg = (
  layer: PhotoLayer,
  layout: PhotoFrameLayout,
  filterId: string,
): string => {
  if (!layer.shadow.enabled || layer.shadow.opacity <= 0) {
    return "";
  }

  const shape = photoSilhouetteShapeSvg(layer, layout, escapeXml(layer.shadow.color));

  return `<g data-photo-shadow="true" transform="translate(${layer.shadow.offsetX} ${layer.shadow.offsetY})" opacity="${layer.shadow.opacity}" filter="url(#${filterId})">${shape}</g>`;
};

const renderPhotoFrameBackgroundSvg = (layer: PhotoLayer, layout: PhotoFrameLayout): string => {
  const fill = escapeXml(photoFrameFill(layer));

  switch (layer.border.framePreset) {
    case "none":
      return `<rect data-frame-preset="none" ${rectSvg(layout.outer)} fill="${escapeXml(layer.border.color)}" opacity="${layer.border.width > 0 ? 1 : 0}" />`;
    case "film":
      return `<rect data-frame-preset="film" ${rectSvg(layout.outer)} fill="${fill}" />${renderFilmSprocketHolesSvg(layer, layout)}`;
    case "paper":
      return `<rect data-frame-preset="paper" ${rectSvg(layout.outer)} fill="${fill}" />${renderPaperTextureSvg(layer)}`;
    case "mat":
    case "polaroid":
      return `<rect data-frame-preset="${layer.border.framePreset}" ${rectSvg(layout.outer)} fill="${fill}" />`;
  }
};

const renderPhotoFrameOverlaySvg = (layer: PhotoLayer, layout: PhotoFrameLayout): string => {
  const dasharray = borderStrokeDasharray(layer.border.style);
  const shortestSide = Math.min(layer.width, layer.height);
  const apertureStrokeWidth = Math.max(1, shortestSide * 0.008);
  const outerStrokeWidth = Math.max(1, layer.border.width * 0.12);
  const frameInset = layer.border.width / 2;

  switch (layer.border.framePreset) {
    case "none":
      return `<rect x="${layer.x + frameInset}" y="${layer.y + frameInset}" width="${Math.max(0, layer.width - layer.border.width)}" height="${Math.max(0, layer.height - layer.border.width)}" rx="${layer.border.radius}" fill="none" stroke="${escapeXml(layer.border.color)}" stroke-width="${layer.border.width}" stroke-dasharray="${dasharray}" />`;
    case "mat":
      return `<rect data-frame-detail="mat-window" ${rectSvg(layout.image)} fill="none" stroke="#202426" stroke-opacity="0.12" stroke-width="${apertureStrokeWidth}" /><rect ${rectSvg(layout.outer)} fill="none" stroke="${escapeXml(layer.border.color)}" stroke-width="${outerStrokeWidth}" stroke-dasharray="${dasharray}" opacity="${layer.border.width > 0 ? 0.7 : 0}" />`;
    case "polaroid": {
      const captionLineY = layer.y + layer.height - layout.insets.bottom * 0.42;
      const captionInset = Math.max(layout.insets.left, shortestSide * 0.05);

      return `<rect data-frame-detail="polaroid-window" ${rectSvg(layout.image)} fill="none" stroke="#202426" stroke-opacity="0.1" stroke-width="${apertureStrokeWidth}" /><path data-frame-detail="polaroid-caption" d="M ${layer.x + captionInset} ${captionLineY} L ${layer.x + layer.width - captionInset} ${captionLineY}" stroke="#202426" stroke-opacity="0.12" stroke-width="${Math.max(1, shortestSide * 0.006)}" stroke-linecap="round" />`;
    }
    case "film":
      return `<rect data-frame-detail="film-window" ${rectSvg(layout.image)} fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="${apertureStrokeWidth}" /><rect ${rectSvg(layout.outer)} fill="none" stroke="#000000" stroke-opacity="0.18" stroke-width="${Math.max(1, shortestSide * 0.006)}" />`;
    case "paper":
      return `<rect data-frame-detail="paper-window" ${rectSvg(layout.image)} fill="none" stroke="#202426" stroke-opacity="0.1" stroke-width="${apertureStrokeWidth}" /><rect ${rectSvg(layout.outer)} fill="none" stroke="${escapeXml(layer.border.color)}" stroke-width="${Math.max(1, shortestSide * 0.01)}" stroke-dasharray="${Math.max(4, shortestSide * 0.035)} ${Math.max(5, shortestSide * 0.028)}" stroke-linecap="round" opacity="0.62" />`;
  }
};

const textStrokeSvgAttributes = (layer: TextLayer): string =>
  layer.stroke.enabled && layer.stroke.width > 0
    ? ` stroke="${escapeXml(layer.stroke.color)}" stroke-width="${layer.stroke.width}" stroke-linejoin="round" paint-order="stroke fill"`
    : "";

const renderTextBackgroundSvg = (layer: TextLayer): string => {
  if (!layer.background.enabled) {
    return "";
  }

  const padding = layer.background.padding;

  return `<rect data-text-background="true" x="${-padding}" y="${-padding}" width="${layer.width + padding * 2}" height="${layer.height + padding * 2}" rx="${layer.background.radius}" fill="${escapeXml(layer.background.color)}" opacity="${layer.background.opacity}" />`;
};

const renderTextEffectFilterSvg = (layer: TextLayer, filterId: string): string => {
  const filterParts: string[] = [];
  const mergeNodes: string[] = [];
  const shadow = layer.shadow.enabled && layer.shadow.opacity > 0;
  const glow = layer.glow.enabled && layer.glow.opacity > 0;

  if (!shadow && !glow) {
    return "";
  }

  if (shadow) {
    filterParts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${layer.shadow.blur}" result="text_shadow_blur" />`,
      `<feOffset in="text_shadow_blur" dx="${layer.shadow.offsetX}" dy="${layer.shadow.offsetY}" result="text_shadow_offset" />`,
      `<feFlood flood-color="${escapeXml(layer.shadow.color)}" flood-opacity="${layer.shadow.opacity}" result="text_shadow_color" />`,
      '<feComposite in="text_shadow_color" in2="text_shadow_offset" operator="in" result="text_shadow" />',
    );
    mergeNodes.push('<feMergeNode in="text_shadow" />');
  }

  if (glow) {
    filterParts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${layer.glow.blur}" result="text_glow_blur" />`,
      `<feFlood flood-color="${escapeXml(layer.glow.color)}" flood-opacity="${layer.glow.opacity}" result="text_glow_color" />`,
      '<feComposite in="text_glow_color" in2="text_glow_blur" operator="in" result="text_glow" />',
    );
    mergeNodes.push('<feMergeNode in="text_glow" />');
  }

  const margin = Math.max(
    layer.stroke.enabled ? layer.stroke.width : 0,
    shadow
      ? Math.abs(layer.shadow.offsetX) + Math.abs(layer.shadow.offsetY) + layer.shadow.blur * 3
      : 0,
    glow ? layer.glow.blur * 3 : 0,
  );

  return `<filter id="${filterId}" filterUnits="userSpaceOnUse" x="${-margin}" y="${-margin}" width="${layer.width + margin * 2}" height="${layer.height + margin * 2}" color-interpolation-filters="sRGB">${filterParts.join("")}<feMerge>${mergeNodes.join("")}<feMergeNode in="SourceGraphic" /></feMerge></filter>`;
};

const renderTextLayerSvg = (
  layer: TextLayer,
  index: number,
  idPrefix: string | undefined,
): { body: string; defs: string } => {
  const bundledFont = getBundledEditorFont(layer.fontFamily);
  const filterId = idPrefix
    ? createSvgId(idPrefix, "text", "filter", index)
    : createSvgId("text", "filter", index);
  const filterDef = renderTextEffectFilterSvg(layer, filterId);
  const contentAttributes = filterDef ? ` filter="url(#${filterId})"` : "";
  const background = renderTextBackgroundSvg(layer);

  if (bundledFont) {
    return {
      body: renderBundledFontTextLayerSvg(layer, bundledFont, background, contentAttributes),
      defs: filterDef,
    };
  }

  const lines = layer.text.split(/\r?\n/).slice(0, 20);
  const lineHeight = layer.fontSize * 1.2;
  const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const x = layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
  const strokeAttributes = textStrokeSvgAttributes(layer);

  return {
    defs: filterDef,
    body: `<g data-layer-id="${escapeXml(layer.id)}" data-font-family="${escapeXml(layer.fontFamily)}" opacity="${layer.opacity}" transform="${layerTransform(layer)}"><g data-layer-local-transform="true" transform="translate(${layer.x} ${layer.y})">${background}<g${contentAttributes}><text x="${x}" y="${layer.fontSize}" fill="${escapeXml(layer.color)}" font-family="${escapeXml(layer.fontFamily)}" font-size="${layer.fontSize}" text-anchor="${anchor}"${strokeAttributes}>${lines
      .map(
        (line, index) =>
          `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
      )
      .join("")}</text></g></g></g>`,
  };
};

const pathNumber = (value: number): string | null => {
  if (!Number.isFinite(value)) {
    return null;
  }

  const roundedValue = Math.round(value * 100) / 100;

  return String(Object.is(roundedValue, -0) ? 0 : roundedValue);
};

const pathCommandData = (command: PathCommand): string | null => {
  switch (command.type) {
    case "M":
    case "L": {
      const x = pathNumber(command.x);
      const y = pathNumber(command.y);

      return x && y ? `${command.type}${x} ${y}` : null;
    }
    case "C": {
      const x1 = pathNumber(command.x1);
      const y1 = pathNumber(command.y1);
      const x2 = pathNumber(command.x2);
      const y2 = pathNumber(command.y2);
      const x = pathNumber(command.x);
      const y = pathNumber(command.y);

      return x1 && y1 && x2 && y2 && x && y ? `C${x1} ${y1} ${x2} ${y2} ${x} ${y}` : null;
    }
    case "Q": {
      const x1 = pathNumber(command.x1);
      const y1 = pathNumber(command.y1);
      const x = pathNumber(command.x);
      const y = pathNumber(command.y);

      return x1 && y1 && x && y ? `Q${x1} ${y1} ${x} ${y}` : null;
    }
    case "Z":
      return "Z";
  }
};

const pathData = (path: Path): string =>
  path.commands
    .map(pathCommandData)
    .filter((commandData): commandData is string => commandData !== null)
    .join("");

const renderBundledFontTextLayerSvg = (
  layer: TextLayer,
  bundledFont: Font,
  background: string,
  contentAttributes: string,
): string => {
  const lines = layer.text.split(/\r?\n/).slice(0, 20);
  const lineHeight = layer.fontSize * 1.2;
  const anchorX =
    layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
  const strokeAttributes = textStrokeSvgAttributes(layer);
  const paths = lines
    .map((line, lineIndex) => {
      const advanceWidth = bundledFont.getAdvanceWidth(line, layer.fontSize);
      const lineX =
        layer.align === "center"
          ? anchorX - advanceWidth / 2
          : layer.align === "right"
            ? anchorX - advanceWidth
            : anchorX;
      const baselineY = layer.fontSize + lineIndex * lineHeight;

      return bundledFont
        .getPaths(line, lineX, baselineY, layer.fontSize)
        .map(pathData)
        .filter((pathData) => pathData.length > 0)
        .map((pathData) => `<path d="${pathData}" />`)
        .join("");
    })
    .join("");

  return `<g data-layer-id="${escapeXml(layer.id)}" data-font-family="${escapeXml(layer.fontFamily)}" opacity="${layer.opacity}" transform="${layerTransform(layer)}"><g data-layer-local-transform="true" transform="translate(${layer.x} ${layer.y})">${background}<g fill="${escapeXml(layer.color)}"${strokeAttributes}${contentAttributes}>${paths}</g></g></g>`;
};

const renderPhotoLayerSvg = (
  layer: PhotoLayer,
  href: string | null | undefined,
  index: number,
  idPrefix: string | undefined,
): { body: string; defs: string } | null => {
  if (!href) {
    return null;
  }

  const clipId = idPrefix
    ? createSvgId(idPrefix, "photo", "clip", index)
    : createSvgId("photo", "clip", index);
  const shadowFilterId = idPrefix
    ? createSvgId(idPrefix, "photo", "shadow", index)
    : createSvgId("photo", "shadow", index);
  const frameLayout = getPhotoFrameLayout(layer);
  const imageWidth = frameLayout.image.width / Math.max(layer.crop.width, 0.05);
  const imageHeight = frameLayout.image.height / Math.max(layer.crop.height, 0.05);
  const imageX =
    frameLayout.image.x -
    layer.crop.x * imageWidth +
    layer.photoTransform.offsetX * imageWidth * 0.5;
  const imageY =
    frameLayout.image.y -
    layer.crop.y * imageHeight +
    layer.photoTransform.offsetY * imageHeight * 0.5;
  const imageCenterX = frameLayout.image.x + frameLayout.image.width / 2;
  const imageCenterY = frameLayout.image.y + frameLayout.image.height / 2;
  const scaleX = layer.photoTransform.flipX
    ? -layer.photoTransform.scale
    : layer.photoTransform.scale;
  const scaleY = layer.photoTransform.flipY
    ? -layer.photoTransform.scale
    : layer.photoTransform.scale;
  const shadowFilter = renderPhotoShadowFilterSvg(layer, shadowFilterId);
  const shadowBody = renderPhotoShadowSvg(layer, frameLayout, shadowFilterId);

  return {
    defs: `${photoClipPath(layer, clipId, frameLayout.image)}${shadowFilter}`,
    body: `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}">${shadowBody}${renderPhotoFrameBackgroundSvg(layer, frameLayout)}<image href="${escapeXml(href)}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid ${layer.fit === "cover" ? "slice" : "meet"}" clip-path="url(#${clipId})" transform="translate(${imageCenterX} ${imageCenterY}) rotate(${layer.photoTransform.rotation}) scale(${scaleX} ${scaleY}) translate(${-imageCenterX} ${-imageCenterY})" />${renderPhotoFrameOverlaySvg(layer, frameLayout)}</g>`,
  };
};

const renderEmbellishmentLayerSvg = (layer: EmbellishmentLayer): string => {
  const label = escapeXml(layer.label);
  const labelText = `<text x="${layer.x + layer.width / 2}" y="${layer.y + layer.height / 2}" dominant-baseline="middle" text-anchor="middle" fill="#202426" font-family="Inter, sans-serif" font-size="${Math.max(24, Math.min(96, layer.height / 3))}" font-weight="700">${label}</text>`;
  const fill = escapeXml(layer.color);
  const accent = escapeXml(layer.accentColor);
  let body: string;

  switch (layer.element) {
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

const renderStickerLayerSvg = (
  layer: StickerLayer,
  stickerSvg: StickerSvg | null | undefined,
): string => {
  if (!stickerSvg) {
    return `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${Math.min(layer.width, layer.height) * 0.08}" fill="#f7f3eb" stroke="#d8ddd8" stroke-width="6" stroke-dasharray="18 14" /></g>`;
  }

  return `<g opacity="${layer.opacity}" transform="${layerTransform(layer)}"><svg x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" viewBox="${escapeXml(stickerSvg.viewBox)}" preserveAspectRatio="xMidYMid meet">${stickerSvg.body}</svg></g>`;
};

const washiTapeOutlinePath = (layer: WashiTapeLayer): string => {
  switch (layer.outline) {
    case "straight":
      return `M ${layerPoint(layer, 0, 0)} L ${layerPoint(layer, 1, 0)} L ${layerPoint(layer, 1, 1)} L ${layerPoint(layer, 0, 1)} Z`;
    case "angled":
      return `M ${layerPolygon(layer, [
        [0.05, 0.05],
        [0.96, 0],
        [1, 0.08],
        [0.94, 0.95],
        [0.02, 1],
        [0, 0.9],
      ])} Z`;
    case "rounded":
      return layerPath(
        layer,
        "M 0.08,0.08 C 0.12,0.01 0.2,0 0.32,0.02 L 0.9,0.04 C 0.98,0.05 1,0.13 0.98,0.24 L 0.94,0.78 C 0.92,0.94 0.84,1 0.72,0.98 L 0.08,0.95 C 0,0.95 0,0.84 0.02,0.7 L 0.04,0.24 C 0.04,0.16 0.05,0.11 0.08,0.08 Z",
      );
    case "torn":
      return `M ${layerPolygon(layer, [
        [0, 0.08],
        [0.05, 0],
        [0.13, 0.06],
        [0.24, 0.01],
        [0.37, 0.08],
        [0.49, 0.02],
        [0.64, 0.07],
        [0.78, 0],
        [0.91, 0.05],
        [1, 0],
        [1, 0.92],
        [0.94, 1],
        [0.82, 0.94],
        [0.7, 0.99],
        [0.58, 0.93],
        [0.44, 1],
        [0.31, 0.95],
        [0.2, 0.99],
        [0.08, 0.93],
        [0, 1],
      ])} Z`;
    case "notched":
      return `M ${layerPolygon(layer, [
        [0.03, 0],
        [0.98, 0],
        [0.94, 1],
        [0.02, 1],
        [0.06, 0.58],
        [0.02, 0.5],
        [0.06, 0.42],
      ])} Z`;
    case "bracket":
      return layerPath(
        layer,
        "M 0.06,0.08 C 0.1,0.02 0.18,0 0.3,0.02 L 0.94,0.06 C 1,0.07 1,0.15 0.95,0.22 C 0.9,0.3 0.9,0.42 0.97,0.52 C 0.92,0.62 0.91,0.76 0.95,0.9 C 0.9,0.98 0.78,1 0.62,0.98 L 0.04,0.94 C 0,0.82 0,0.7 0.04,0.58 C 0.08,0.48 0.08,0.36 0.03,0.26 C 0.02,0.18 0.03,0.12 0.06,0.08 Z",
      );
    case "pinched":
      return layerPath(
        layer,
        "M 0,0.08 C 0.08,0.01 0.26,0.03 0.46,0.04 L 0.93,0 C 1,0.05 1,0.18 0.96,0.32 C 0.93,0.42 0.94,0.58 0.98,0.7 C 1,0.82 0.96,0.95 0.9,1 L 0.42,0.97 C 0.23,0.96 0.08,0.99 0,0.92 C 0.04,0.8 0.04,0.64 0,0.52 C 0.06,0.42 0.06,0.28 0,0.08 Z",
      );
    case "tapered":
      return `M ${layerPolygon(layer, [
        [0.08, 0.22],
        [0.96, 0],
        [1, 0.06],
        [0.98, 0.34],
        [0.93, 0.54],
        [1, 0.94],
        [0.94, 1],
        [0.06, 0.76],
        [0, 0.62],
        [0.04, 0.48],
      ])} Z`;
    case "scallop":
      return layerPath(
        layer,
        "M 0,0.12 Q 0.06,0 0.12,0.12 T 0.24,0.12 T 0.36,0.12 T 0.48,0.12 T 0.6,0.12 T 0.72,0.12 T 0.84,0.12 T 0.96,0.12 Q 1,0.06 1,0.14 L 1,0.86 Q 0.94,1 0.88,0.88 T 0.76,0.88 T 0.64,0.88 T 0.52,0.88 T 0.4,0.88 T 0.28,0.88 T 0.16,0.88 T 0.04,0.88 Q 0,0.94 0,0.86 Z",
      );
    case "stamp":
      return `M ${layerPolygon(layer, [
        [0.03, 0],
        [0.08, 0.05],
        [0.13, 0],
        [0.18, 0.05],
        [0.23, 0],
        [0.28, 0.05],
        [0.33, 0],
        [0.38, 0.05],
        [0.43, 0],
        [0.48, 0.05],
        [0.53, 0],
        [0.58, 0.05],
        [0.63, 0],
        [0.68, 0.05],
        [0.73, 0],
        [0.78, 0.05],
        [0.83, 0],
        [0.88, 0.05],
        [0.93, 0],
        [1, 0.06],
        [0.96, 0.5],
        [1, 0.94],
        [0.93, 1],
        [0.88, 0.95],
        [0.83, 1],
        [0.78, 0.95],
        [0.73, 1],
        [0.68, 0.95],
        [0.63, 1],
        [0.58, 0.95],
        [0.53, 1],
        [0.48, 0.95],
        [0.43, 1],
        [0.38, 0.95],
        [0.33, 1],
        [0.28, 0.95],
        [0.23, 1],
        [0.18, 0.95],
        [0.13, 1],
        [0.08, 0.95],
        [0.03, 1],
        [0, 0.94],
        [0.04, 0.5],
        [0, 0.06],
      ])} Z`;
    case "wave":
      return layerPath(
        layer,
        "M 0,0.2 C 0.12,0 0.2,0.34 0.32,0.16 S 0.54,0.02 0.66,0.18 S 0.88,0.28 1,0.1 L 1,0.82 C 0.88,1 0.8,0.66 0.68,0.84 S 0.46,0.98 0.34,0.82 S 0.12,0.72 0,0.9 Z",
      );
  }
};

const renderWashiTapeLayerSvg = (
  layer: WashiTapeLayer,
  href: string | null | undefined,
  index: number,
  idPrefix: string | undefined,
): { body: string; defs: string } | null => {
  if (layer.pattern.kind === "customPhoto" && !href) {
    return null;
  }

  const patternId = idPrefix
    ? createSvgId(idPrefix, "washi", "pattern", index)
    : createSvgId("washi", "pattern", index);
  const outline = washiTapeOutlinePath(layer);
  const tileBase = washiTapeTileBaseSize * layer.tile.scale;
  const tileWidth = roundSvgNumber(tileBase * layer.tile.scaleX);
  const tileHeight = roundSvgNumber(tileBase * layer.tile.scaleY);
  const shortestTileSide = Math.min(tileWidth, tileHeight);
  const patternX = roundSvgNumber(layer.x + layer.tile.offsetX * tileWidth);
  const patternY = roundSvgNumber(layer.y + layer.tile.offsetY * tileHeight);
  const patternCenterX = layer.x + layer.width / 2;
  const patternCenterY = layer.y + layer.height / 2;
  const primaryColor = escapeXml(layer.pattern.primaryColor);
  const secondaryColor = escapeXml(layer.pattern.secondaryColor);
  const patternBody = (() => {
    switch (layer.pattern.kind) {
      case "solid":
        return `<rect width="${tileWidth}" height="${tileHeight}" fill="${primaryColor}" />`;
      case "polkaDot": {
        const dotRadius = roundSvgNumber(shortestTileSide * 0.13);
        const dotCenters: Array<[number, number]> = [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75],
        ];
        const dots = dotCenters
          .map(
            ([centerX, centerY]) =>
              `<circle cx="${roundSvgNumber(tileWidth * centerX)}" cy="${roundSvgNumber(tileHeight * centerY)}" r="${dotRadius}" fill="${secondaryColor}" />`,
          )
          .join("");

        return `<rect width="${tileWidth}" height="${tileHeight}" fill="${primaryColor}" />${dots}`;
      }
      case "stripe":
        return `<rect width="${tileWidth}" height="${tileHeight}" fill="${primaryColor}" /><rect y="${roundSvgNumber(tileHeight * 0.18)}" width="${tileWidth}" height="${roundSvgNumber(tileHeight * 0.18)}" fill="${secondaryColor}" /><rect y="${roundSvgNumber(tileHeight * 0.68)}" width="${tileWidth}" height="${roundSvgNumber(tileHeight * 0.18)}" fill="${secondaryColor}" />`;
      case "grid":
        return `<rect width="${tileWidth}" height="${tileHeight}" fill="${primaryColor}" /><path d="M ${roundSvgNumber(tileWidth * 0.5)} 0 V ${tileHeight} M 0 ${roundSvgNumber(tileHeight * 0.5)} H ${tileWidth}" stroke="${secondaryColor}" stroke-width="${Math.max(1, roundSvgNumber(shortestTileSide * 0.08))}" opacity="0.72" />`;
      case "checker":
        return `<rect width="${tileWidth}" height="${tileHeight}" fill="${primaryColor}" /><rect width="${roundSvgNumber(tileWidth * 0.5)}" height="${roundSvgNumber(tileHeight * 0.5)}" fill="${secondaryColor}" /><rect x="${roundSvgNumber(tileWidth * 0.5)}" y="${roundSvgNumber(tileHeight * 0.5)}" width="${roundSvgNumber(tileWidth * 0.5)}" height="${roundSvgNumber(tileHeight * 0.5)}" fill="${secondaryColor}" />`;
      case "customPhoto":
        return `<image href="${escapeXml(href ?? "")}" x="0" y="0" width="${tileWidth}" height="${tileHeight}" preserveAspectRatio="xMidYMid slice" />`;
    }
  })();

  return {
    defs: `<pattern id="${patternId}" patternUnits="userSpaceOnUse" x="${patternX}" y="${patternY}" width="${tileWidth}" height="${tileHeight}" patternTransform="rotate(${layer.tile.rotation} ${patternCenterX} ${patternCenterY})">${patternBody}</pattern>`,
    body: `<g data-layer-id="${escapeXml(layer.id)}" opacity="${layer.opacity}" transform="${layerTransform(layer)}"><path data-washi-outline="${layer.outline}" d="${outline}" fill="url(#${patternId})" /><path d="${outline}" fill="#ffffff" opacity="0.18" /><path d="${outline}" fill="none" stroke="#202426" stroke-opacity="0.14" stroke-width="${Math.max(1, layer.height * 0.025)}" /></g>`,
  };
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
      const rendered = renderPhotoLayerSvg(
        layer,
        options.resolvePhotoHref?.(layer),
        index,
        options.idPrefix,
      );

      if (rendered) {
        defs.push(rendered.defs);
        bodies.push(rendered.body);
      }

      continue;
    }

    if (layer.kind === "washiTape") {
      const rendered = renderWashiTapeLayerSvg(
        layer,
        layer.pattern.kind === "customPhoto" ? options.resolveWashiTapeHref?.(layer) : undefined,
        index,
        options.idPrefix,
      );

      if (rendered) {
        defs.push(rendered.defs);
        bodies.push(rendered.body);
      }

      continue;
    }

    if (layer.kind === "text") {
      const rendered = renderTextLayerSvg(layer, index, options.idPrefix);

      if (rendered.defs) {
        defs.push(rendered.defs);
      }

      bodies.push(rendered.body);
      continue;
    }

    bodies.push(
      layer.kind === "embellishment"
        ? renderEmbellishmentLayerSvg(layer)
        : renderStickerLayerSvg(layer, options.resolveStickerSvg?.(layer)),
    );
  }

  const background =
    options.includeBackground === false
      ? ""
      : `<rect width="100%" height="100%" fill="${escapeXml(parsedDocument.canvas.backgroundColor)}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${parsedDocument.canvas.width}" height="${parsedDocument.canvas.height}" viewBox="0 0 ${parsedDocument.canvas.width} ${parsedDocument.canvas.height}"><defs>${defs.join("")}</defs>${background}${bodies.join("")}</svg>`;
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
    text: input.text,
    x: input.x ?? 240,
    y: input.y ?? 1080,
    width: input.width ?? 960,
    height: input.height ?? 180,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    locked: input.locked ?? false,
    fontFamily: input.fontFamily ?? defaultTextFontFamily,
    fontSize: input.fontSize ?? 72,
    color: input.color ?? "#202426",
    align: input.align ?? "left",
    stroke: input.stroke ?? defaultTextStroke,
    shadow: input.shadow ?? defaultTextShadow,
    glow: input.glow ?? defaultTextGlow,
    background: input.background ?? defaultTextBackground,
  });

export const createEmbellishmentLayer = (
  input: CreateEmbellishmentLayerInput = {},
): EmbellishmentLayer =>
  embellishmentLayerSchema.parse({
    id: input.id ?? createLayerId(),
    kind: "embellishment",
    x: input.x ?? 320,
    y: input.y ?? 320,
    width: input.width ?? 420,
    height: input.height ?? 220,
    rotation: input.rotation ?? -4,
    opacity: input.opacity ?? 1,
    locked: input.locked ?? false,
    element: input.element ?? "paper-label",
    color: input.color ?? "#d6a537",
    accentColor: input.accentColor ?? "#24766e",
    label: input.label ?? "",
  });

export const createStickerLayer = (input: CreateStickerLayerInput = {}): StickerLayer =>
  stickerLayerSchema.parse({
    id: input.id ?? createLayerId(),
    kind: "sticker",
    x: input.x ?? 360,
    y: input.y ?? 360,
    width: input.width ?? 360,
    height: input.height ?? 360,
    rotation: input.rotation ?? 0,
    opacity: input.opacity ?? 1,
    locked: input.locked ?? false,
    stickerId: input.stickerId ?? "noto:red-heart",
  });

export const createWashiTapeLayer = (input: CreateWashiTapeLayerInput): WashiTapeLayer =>
  washiTapeLayerSchema.parse({
    id: input.id ?? createLayerId(),
    kind: "washiTape",
    assetId: input.assetId,
    x: input.x ?? 240,
    y: input.y ?? 240,
    width: input.width ?? 960,
    height: input.height ?? 180,
    rotation: input.rotation ?? -3,
    opacity: input.opacity ?? 0.86,
    locked: input.locked ?? false,
    outline: input.outline ?? "torn",
    pattern:
      input.pattern ??
      (input.assetId
        ? { ...legacyPhotoWashiTapePattern, assetId: input.assetId }
        : defaultWashiTapePattern),
    tile: input.tile ? { ...defaultWashiTapeTile, ...input.tile } : defaultWashiTapeTile,
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
        ...(layer.kind === "text"
          ? {
              fontSize: layer.fontSize * textScale,
              stroke: { ...layer.stroke, width: layer.stroke.width * textScale },
              shadow: {
                ...layer.shadow,
                offsetX: layer.shadow.offsetX * scaleX,
                offsetY: layer.shadow.offsetY * scaleY,
                blur: layer.shadow.blur * textScale,
              },
              glow: { ...layer.glow, blur: layer.glow.blur * textScale },
              background: {
                ...layer.background,
                padding: layer.background.padding * textScale,
                radius: layer.background.radius * textScale,
              },
            }
          : {}),
        ...(layer.kind === "photo"
          ? {
              shadow: {
                ...layer.shadow,
                offsetX: layer.shadow.offsetX * scaleX,
                offsetY: layer.shadow.offsetY * scaleY,
                blur: layer.shadow.blur * textScale,
                spread: layer.shadow.spread * textScale,
              },
            }
          : {}),
      }),
    ),
  });
};

const createSingleBookSpread = (page: OrderedBookPage, spreadIndex: number): BookSpread => ({
  spreadIndex,
  kind: "single",
  leftPageId: page.pageId,
  rightPageId: null,
  pageIds: [page.pageId],
});

const createSequentialBookSpreads = (
  pages: OrderedBookPage[],
  startingSpreadIndex: number,
): BookSpread[] =>
  pages.reduce<BookSpread[]>((spreads, page, index) => {
    const spreadIndex = startingSpreadIndex + Math.floor(index / 2);
    const isLeftPage = index % 2 === 0;

    if (isLeftPage) {
      spreads.push(createSingleBookSpread(page, spreadIndex));

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

export const createBookSpreads = (
  pages: OrderedBookPage[],
  options: CreateBookSpreadsOptions = {},
): BookSpread[] => {
  const sortedPages = [...pages].sort((first, second) => first.sortOrder - second.sortOrder);

  if (sortedPages.length <= 1) {
    return createSequentialBookSpreads(sortedPages, 0);
  }

  const frontCover = sortedPages[0];
  const backCover = sortedPages[sortedPages.length - 1];
  const interiorPages = sortedPages.slice(1, -1);

  if (!frontCover || !backCover) {
    return [];
  }

  if (options.coverSpreadEnabled ?? true) {
    return [
      {
        spreadIndex: 0,
        kind: "facing",
        leftPageId: frontCover.pageId,
        rightPageId: backCover.pageId,
        pageIds: [frontCover.pageId, backCover.pageId],
      },
      ...createSequentialBookSpreads(interiorPages, 1),
    ];
  }

  return [
    createSingleBookSpread(frontCover, 0),
    ...createSequentialBookSpreads(interiorPages, 1),
    createSingleBookSpread(backCover, Math.ceil(interiorPages.length / 2) + 1),
  ];
};
