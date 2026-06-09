import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { extractGoodnotesStickers, isGoodnotesFile } from "./goodnotesExtractor";

const pngBytes = (): Uint8Array => {
  // 1x1 transparent PNG
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
};

const jpegBytes = (): Uint8Array =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00]);

const heicBytes = (): Uint8Array =>
  new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
    0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
  ]);

const jp2Bytes = (): Uint8Array =>
  new Uint8Array([
    0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a, 0x00, 0x00, 0x00, 0x14,
  ]);

const pdfBytes = (): Uint8Array => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const svgBytes = (): Uint8Array =>
  new TextEncoder().encode(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>`);

const plistBytes = (): Uint8Array =>
  new TextEncoder().encode(`<?xml version="1.0"?><plist version="1.0"><dict/></plist>`);

const buildArchive = (entries: Record<string, Uint8Array>): File => {
  const zipped = zipSync(entries);
  return new File([zipped], "notebook.goodnotes", {
    type: "application/octet-stream",
  });
};

describe("isGoodnotesFile", () => {
  it("matches .goodnotes regardless of case", () => {
    expect(isGoodnotesFile(new File([new Uint8Array()], "Note.goodnotes"))).toBe(true);
    expect(isGoodnotesFile(new File([new Uint8Array()], "Note.GOODNOTES"))).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(isGoodnotesFile(new File([new Uint8Array()], "Note.zip"))).toBe(false);
    expect(isGoodnotesFile(new File([new Uint8Array()], "Note.png"))).toBe(false);
  });
});

describe("extractGoodnotesStickers", () => {
  it("returns supported image formats with corrected names and mime types", async () => {
    const source = buildArchive({
      "Document/attachments/uuid-png": pngBytes(),
      "Document/attachments/photo.jpg": jpegBytes(),
      "Document/attachments/vector": svgBytes(),
      "Document/Metadata.plist": plistBytes(),
      "Document/strokes.pb": new Uint8Array([0x08, 0x01]),
    });

    const result = await extractGoodnotesStickers(source);

    expect(result.files.map((file) => ({ name: file.name, type: file.type }))).toEqual([
      { name: "uuid-png.png", type: "image/png" },
      { name: "photo.jpg", type: "image/jpeg" },
      { name: "vector.svg", type: "image/svg+xml" },
    ]);
    expect(result.skipped).toEqual({ unsupportedImage: 0, nonImage: 0 });
  });

  it("emits HEIC entries (the server transcodes them) and counts PDFs as unsupported", async () => {
    const source = buildArchive({
      "a/heicfile": heicBytes(),
      "a/document": pdfBytes(),
      "a/photo": jpegBytes(),
    });

    const result = await extractGoodnotesStickers(source);

    expect(result.files.map((file) => ({ name: file.name, type: file.type }))).toEqual([
      { name: "heicfile.heic", type: "image/heic" },
      { name: "photo.jpg", type: "image/jpeg" },
    ]);
    expect(result.skipped.unsupportedImage).toBe(1);
  });

  it("emits JP2 entries (the server transcodes them) and reports them in the trace", async () => {
    const source = buildArchive({
      "attachments/photo-jp2": jp2Bytes(),
    });

    const result = await extractGoodnotesStickers(source);

    expect(result.files.map((file) => ({ name: file.name, type: file.type }))).toEqual([
      { name: "photo-jp2.jp2", type: "image/jp2" },
    ]);
    expect(result.skipped).toEqual({ unsupportedImage: 0, nonImage: 0 });
    expect(result.entries[0]?.decision).toContain("accepted image/jp2");
  });

  it("counts arbitrary binary entries as non-image", async () => {
    const source = buildArchive({
      "a/binary": new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
      "a/note.png": pngBytes(),
    });

    const result = await extractGoodnotesStickers(source);

    expect(result.files).toHaveLength(1);
    expect(result.skipped.nonImage).toBe(1);
  });

  it("skips Goodnotes-generated thumbnail images at any path", async () => {
    const source = buildArchive({
      thumbnail: pngBytes(),
      "Document/thumbnail.jpg": jpegBytes(),
      "Document/THUMBNAIL.png": pngBytes(),
      "Document/attachments/photo.jpg": jpegBytes(),
    });

    const result = await extractGoodnotesStickers(source);

    expect(result.files.map((file) => file.name)).toEqual(["photo.jpg"]);
    expect(result.skipped).toEqual({ unsupportedImage: 0, nonImage: 0 });
  });

  it("throws when the file is not a valid zip", async () => {
    const garbage = new File([new Uint8Array([0, 1, 2, 3, 4, 5])], "broken.goodnotes");
    await expect(extractGoodnotesStickers(garbage)).rejects.toThrow(/Goodnotes/);
  });
});
