import opentype, { type Font } from "opentype.js";

import { googleFontBase64ById } from "./generated/googleFonts.js";
import { type GoogleFontDefinition, type GoogleFontId, googleFonts } from "./google-fonts.js";

export const defaultTextFontFamily = "Inter, sans-serif";
export const loveYaLikeASisterFontFamily = "Love Ya Like A Sister";

export type EditorFontId = "system" | GoogleFontId;
export type EditorFontCategory = "system" | GoogleFontDefinition["category"];
export type EditorFontMatchKind = GoogleFontDefinition["matchKind"] | "bundled";

export type EditorFontDefinition = {
  category: EditorFontCategory;
  family: string;
  googleFamily?: string;
  id: EditorFontId;
  label: string;
  license: string;
  matchKind: EditorFontMatchKind;
  source: string;
  vendorPath?: string;
};

const googleFontDefinitions: readonly EditorFontDefinition[] = googleFonts.map((font) => ({
  category: font.category,
  family: font.family,
  googleFamily: font.googleFamily,
  id: font.id,
  label: font.label,
  license: font.license,
  matchKind: font.matchKind,
  source: `Google Fonts: ${font.googleFamily}`,
  vendorPath: font.vendorPath,
}));

export const editorFontDefinitions: readonly EditorFontDefinition[] = [
  {
    category: "system",
    family: defaultTextFontFamily,
    id: "system",
    label: "Inter",
    license: "System font stack",
    matchKind: "bundled",
    source: "Bundled app default",
  },
  ...googleFontDefinitions,
];

const cssString = (value: string): string => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const fontFaceCss = (family: string, fontBase64: string): string =>
  `@font-face{font-family:'${cssString(family)}';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/truetype;base64,${fontBase64}) format('truetype');}`;

const googleFontFaceCss = googleFonts
  .map((font) => fontFaceCss(font.family, googleFontBase64ById[font.id]))
  .join("");

export const editorFontFaceCss = googleFontFaceCss;

const googleFontBase64ByFamily = googleFonts.map(
  (font) =>
    [font.family, googleFontBase64ById[font.id]] as const satisfies readonly [string, string],
);

const fontBase64ByFamily = new Map<string, string>(googleFontBase64ByFamily);
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
