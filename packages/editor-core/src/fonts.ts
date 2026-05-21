import opentype, { type Font } from "opentype.js";

import { loveYaLikeASisterFontBase64 } from "./generated/loveYaLikeASisterFont.js";

export const defaultTextFontFamily = "Inter, sans-serif";
export const loveYaLikeASisterFontFamily = "Love Ya Like A Sister";

export type EditorFontId = "system" | "love-ya-like-a-sister";

export type EditorFontDefinition = {
  category: "system" | "playful";
  family: string;
  id: EditorFontId;
  label: string;
  license: string;
  source: string;
};

export const editorFontDefinitions: readonly EditorFontDefinition[] = [
  {
    category: "system",
    family: defaultTextFontFamily,
    id: "system",
    label: "Inter",
    license: "System font stack",
    source: "Bundled app default",
  },
  {
    category: "playful",
    family: loveYaLikeASisterFontFamily,
    id: "love-ya-like-a-sister",
    label: "Love Ya Like A Sister",
    license: "SIL Open Font License 1.1",
    source: "Google Fonts",
  },
];

export const editorFontFaceCss = `@font-face{font-family:'${loveYaLikeASisterFontFamily}';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/truetype;base64,${loveYaLikeASisterFontBase64}) format('truetype');}`;

const fontBase64ByFamily = new Map([[loveYaLikeASisterFontFamily, loveYaLikeASisterFontBase64]]);
const parsedFontByFamily = new Map<string, Font>();

const primaryFontFamily = (fontFamily: string): string =>
  fontFamily
    .split(",")[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, "") ?? fontFamily;

const decodeBase64Font = (fontBase64: string): ArrayBuffer => {
  const binaryFont = globalThis.atob(fontBase64);
  const fontBytes = new Uint8Array(binaryFont.length);

  for (let byteIndex = 0; byteIndex < binaryFont.length; byteIndex += 1) {
    fontBytes[byteIndex] = binaryFont.charCodeAt(byteIndex);
  }

  return fontBytes.buffer;
};

export const getEditorFontByFamily = (fontFamily: string): EditorFontDefinition | undefined => {
  const family = primaryFontFamily(fontFamily);

  return editorFontDefinitions.find((fontDefinition) => fontDefinition.family === family);
};

export const getBundledEditorFont = (fontFamily: string): Font | null => {
  const family = primaryFontFamily(fontFamily);
  const existingFont = parsedFontByFamily.get(family);

  if (existingFont) {
    return existingFont;
  }

  const fontBase64 = fontBase64ByFamily.get(family);

  if (!fontBase64) {
    return null;
  }

  const parsedFont = opentype.parse(decodeBase64Font(fontBase64));

  parsedFontByFamily.set(family, parsedFont);

  return parsedFont;
};
