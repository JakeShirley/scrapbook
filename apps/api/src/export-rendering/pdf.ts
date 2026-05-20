import type { ExportPreset } from "@scrapbook/api-contract";

import { checksumSha256 } from "./checksums.js";
import { type RenderedRasterImage, renderSvgRasterImage } from "./raster.js";
import type { RenderedExport } from "./types.js";

const createPdfFromJpegImages = (images: RenderedRasterImage[]): Buffer => {
  const buffers: Buffer[] = [];
  const offsets = new Map<number, number>();
  let byteOffset = 0;
  const push = (part: string | Buffer) => {
    const buffer = typeof part === "string" ? Buffer.from(part, "binary") : part;

    buffers.push(buffer);
    byteOffset += buffer.byteLength;
  };
  const pushObject = (objectNumber: number, parts: Array<string | Buffer>) => {
    offsets.set(objectNumber, byteOffset);
    push(`${objectNumber} 0 obj\n`);
    for (const part of parts) push(part);
    push("\nendobj\n");
  };
  const objectCount = 2 + images.length * 3;
  const pageObjectNumber = (index: number): number => 3 + index * 3;
  const contentObjectNumber = (index: number): number => pageObjectNumber(index) + 1;
  const imageObjectNumber = (index: number): number => pageObjectNumber(index) + 2;
  const pageRefs = images.map((_, index) => `${pageObjectNumber(index)} 0 R`).join(" ");

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  pushObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  pushObject(2, [`<< /Type /Pages /Kids [${pageRefs}] /Count ${images.length} >>`]);

  for (const [index, image] of images.entries()) {
    const pageWidth = Math.max(1, Math.round(image.width));
    const pageHeight = Math.max(1, Math.round(image.height));
    const imageName = `Im${index + 1}`;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ`;

    pushObject(pageObjectNumber(index), [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageObjectNumber(index)} 0 R >> >> /Contents ${contentObjectNumber(index)} 0 R >>`,
    ]);
    pushObject(contentObjectNumber(index), [
      `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`,
    ]);
    pushObject(imageObjectNumber(index), [
      `<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.buffer.byteLength} >>\nstream\n`,
      image.buffer,
      "\nendstream",
    ]);
  }

  const xrefOffset = byteOffset;
  push(`xref\n0 ${objectCount + 1}\n`);
  push("0000000000 65535 f \n");
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    push(`${String(offsets.get(objectNumber) ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(buffers);
};

export const renderSvgPdf = async (
  svgs: string[],
  preset: ExportPreset,
): Promise<RenderedExport> => {
  const images = await Promise.all(
    svgs.map((svg) => renderSvgRasterImage(svg, "jpeg", { preset })),
  );
  const buffer = createPdfFromJpegImages(images);

  return {
    buffer,
    byteSize: buffer.byteLength,
    checksumSha256: checksumSha256(buffer),
    extension: ".pdf",
    mimeType: "application/pdf",
  };
};
