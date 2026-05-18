import type { PageRecord } from "../persistence/schema.js";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

type RenderedBookPage = {
  page: Pick<PageRecord, "height" | "title" | "width">;
  svg: string;
};

export const createBookSheetSvg = (renderedPages: RenderedBookPage[]): string => {
  const pageWidth = Math.max(...renderedPages.map(({ page }) => page.width));
  const pageHeight = Math.max(...renderedPages.map(({ page }) => page.height));
  const gutter = Math.round(pageWidth * 0.04);
  const labelHeight = 96;
  const sheetWidth = pageWidth * 2 + gutter * 3;
  const rowHeight = pageHeight + labelHeight + gutter;
  const sheetHeight = renderedPages.length * rowHeight + gutter;
  const body = renderedPages
    .map(({ page, svg }, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = gutter + column * (pageWidth + gutter);
      const y = gutter + row * rowHeight + labelHeight;
      const encodedSvg = Buffer.from(svg).toString("base64");

      return `<text x="${x}" y="${y - 26}" fill="#202426" font-family="Inter, sans-serif" font-size="42" font-weight="700">${escapeXml(`${index + 1}. ${page.title}`)}</text><image href="data:image/svg+xml;base64,${encodedSvg}" x="${x}" y="${y}" width="${pageWidth}" height="${pageHeight}" preserveAspectRatio="xMidYMid meet" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}"><rect width="100%" height="100%" fill="#f5f3ee" />${body}</svg>`;
};
