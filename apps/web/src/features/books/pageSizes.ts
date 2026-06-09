import { commonBookPageSizes, defaultBookPageSize } from "@zakka/api-contract";

export { commonBookPageSizes, defaultBookPageSize };

export const customBookPageSizeKey = "custom";

type BookPageSize = {
  pageHeight: number;
  pageWidth: number;
};

const formatInches = (pixels: number): string => {
  const inches = pixels / 300;

  return Number.isInteger(inches) ? String(inches) : inches.toFixed(1);
};

export const findCommonBookPageSize = (pageSize: BookPageSize) =>
  commonBookPageSizes.find(
    (preset) => preset.width === pageSize.pageWidth && preset.height === pageSize.pageHeight,
  ) ?? null;

export const formatBookPageSize = (pageSize: BookPageSize): string =>
  findCommonBookPageSize(pageSize)?.label ??
  `${formatInches(pageSize.pageWidth)} x ${formatInches(pageSize.pageHeight)} in custom`;

export const getBookPageSizeKey = (pageSize: BookPageSize): string =>
  findCommonBookPageSize(pageSize)?.key ?? customBookPageSizeKey;

export const getBookPageSizeByKey = (key: string) =>
  commonBookPageSizes.find((preset) => preset.key === key) ?? defaultBookPageSize;
