import type { EmbellishmentLayer } from "@scrapbook/editor-core";

export type EmbellishmentPreset = Pick<
  EmbellishmentLayer,
  "accentColor" | "color" | "element" | "label" | "name"
>;

export const embellishmentPresets: EmbellishmentPreset[] = [
  {
    accentColor: "#24766e",
    color: "#d6a537",
    element: "sticker-star",
    label: "",
    name: "Star sticker",
  },
  {
    accentColor: "#d56d46",
    color: "#fffdf7",
    element: "paper-label",
    label: "Memory",
    name: "Paper label",
  },
  {
    accentColor: "#ffffff",
    color: "#79a9a4",
    element: "washi-tape",
    label: "",
    name: "Washi tape",
  },
  {
    accentColor: "#202426",
    color: "#fffdf7",
    element: "photo-corner",
    label: "",
    name: "Photo corner",
  },
  {
    accentColor: "#d6a537",
    color: "#f2d7c9",
    element: "pattern-paper",
    label: "",
    name: "Pattern paper",
  },
];
