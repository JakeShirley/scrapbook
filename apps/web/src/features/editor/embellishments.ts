import type { EmbellishmentLayer } from "@scrapbook/editor-core";

export type EmbellishmentPreset = Pick<
  EmbellishmentLayer,
  "accentColor" | "color" | "element" | "label"
> & { displayName: string };

export const embellishmentPresets: EmbellishmentPreset[] = [
  {
    accentColor: "#d56d46",
    color: "#fffdf7",
    displayName: "Paper label",
    element: "paper-label",
    label: "Memory",
  },
  {
    accentColor: "#ffffff",
    color: "#79a9a4",
    displayName: "Color tape",
    element: "washi-tape",
    label: "",
  },
  {
    accentColor: "#202426",
    color: "#fffdf7",
    displayName: "Photo corner",
    element: "photo-corner",
    label: "",
  },
  {
    accentColor: "#d6a537",
    color: "#f2d7c9",
    displayName: "Pattern paper",
    element: "pattern-paper",
    label: "",
  },
];
