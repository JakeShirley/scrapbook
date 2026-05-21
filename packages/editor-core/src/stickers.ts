import type { IconifyJSON } from "@iconify/types";
import { getIconData } from "@iconify/utils/lib/icon-set/get-icon";
import { iconToSVG } from "@iconify/utils/lib/svg/build";
import { replaceIDs } from "@iconify/utils/lib/svg/id";
import { icons as notoIcons, info as notoInfo, metadata as notoMetadata } from "@iconify-json/noto";
import {
  icons as twemojiIcons,
  info as twemojiInfo,
  metadata as twemojiMetadata,
} from "@iconify-json/twemoji";

import type { StickerDefinition, StickerId, StickerLibraryId, StickerSvg } from "./index.js";
import { normalizeStickerId } from "./index.js";

type StickerMetadata = {
  categories?: Record<string, string[]>;
};

type StickerLibrary = {
  icons: IconifyJSON;
  id: StickerLibraryId;
  license: string;
  metadata: StickerMetadata;
  name: string;
};

const notoLibrary: StickerLibrary = {
  icons: notoIcons,
  id: "noto",
  license: notoInfo.license.spdx ?? "Apache-2.0",
  metadata: notoMetadata as StickerMetadata,
  name: notoInfo.name,
};

const twemojiLibrary: StickerLibrary = {
  icons: twemojiIcons,
  id: "twemoji",
  license: twemojiInfo.license.spdx ?? "CC-BY-4.0",
  metadata: twemojiMetadata as StickerMetadata,
  name: twemojiInfo.name,
};

const stickerLibraries: readonly StickerLibrary[] = [notoLibrary, twemojiLibrary];

const humanizeIconName = (icon: string): string =>
  icon
    .split("-")
    .map((part) => (part.length === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join(" ");

const getIconCategoryMap = (library: StickerLibrary): Map<string, string> => {
  const categories = new Map<string, string>();

  for (const [category, icons] of Object.entries(library.metadata.categories ?? {})) {
    for (const icon of icons) {
      categories.set(icon, category);
    }
  }

  return categories;
};

const getLibraryStickers = (library: StickerLibrary): StickerDefinition[] => {
  const iconNames = new Set([
    ...Object.keys(library.icons.icons),
    ...Object.keys(library.icons.aliases ?? {}),
  ]);
  const categoryByIcon = getIconCategoryMap(library);

  return [...iconNames].sort().map((icon) => ({
    category: categoryByIcon.get(icon) ?? library.name,
    icon,
    id: `${library.id}:${icon}` as StickerId,
    library: library.id,
    libraryName: library.name,
    name: humanizeIconName(icon),
  }));
};

export const stickerCatalog: readonly StickerDefinition[] = stickerLibraries.flatMap((library) =>
  getLibraryStickers(library),
);

export const stickerLibraryCounts: Readonly<Record<StickerLibraryId, number>> = {
  noto: getLibraryStickers(notoLibrary).length,
  twemoji: getLibraryStickers(twemojiLibrary).length,
};

const stickerById = new Map(stickerCatalog.map((sticker) => [sticker.id, sticker]));
const libraryById = new Map(stickerLibraries.map((library) => [library.id, library]));

const splitStickerId = (stickerId: StickerId): { icon: string; library: StickerLibrary } | null => {
  const normalizedStickerId = normalizeStickerId(stickerId);
  const separatorIndex = normalizedStickerId.indexOf(":");
  const libraryId = normalizedStickerId.slice(0, separatorIndex) as StickerLibraryId;
  const icon = normalizedStickerId.slice(separatorIndex + 1);
  const library = libraryById.get(libraryId);

  return library ? { icon, library } : null;
};

export const getStickerDefinition = (stickerId: string): StickerDefinition | null =>
  stickerById.get(normalizeStickerId(stickerId)) ?? null;

export const getStickerSvg = (stickerId: string): StickerSvg | null => {
  const split = splitStickerId(normalizeStickerId(stickerId));

  if (!split) {
    return null;
  }

  const icon = getIconData(split.library.icons, split.icon);

  if (!icon) {
    return null;
  }

  const svg = iconToSVG(icon, { height: "auto", width: "auto" });

  return {
    body: replaceIDs(svg.body),
    viewBox: svg.attributes.viewBox,
  };
};

export const renderStickerAssetSvg = (stickerId: string): string => {
  const stickerSvg = getStickerSvg(stickerId);

  if (!stickerSvg) {
    throw new Error(`Unknown sticker: ${stickerId}`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${stickerSvg.viewBox}">${stickerSvg.body}</svg>`;
};

export const searchStickers = ({
  library,
  limit = 120,
  offset = 0,
  query = "",
}: {
  library?: StickerLibraryId;
  limit?: number;
  offset?: number;
  query?: string;
} = {}): { stickers: StickerDefinition[]; total: number } => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = stickerCatalog.filter((sticker) => {
    if (library && sticker.library !== library) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [sticker.name, sticker.icon, sticker.category, sticker.libraryName]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });

  return {
    stickers: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
};
