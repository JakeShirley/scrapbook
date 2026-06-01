import { createRequire } from "node:module";

type HeicConvert = (input: { buffer: Buffer; format: "PNG" }) => Promise<ArrayBuffer | Uint8Array>;

const require = createRequire(import.meta.url);
const heicConvert = require("heic-convert") as HeicConvert;

const heicBrands = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx"]);
const heifOnlyBrands = new Set(["mif1", "msf1", "heif"]);
const heifBrands = new Set([...heicBrands, ...heifOnlyBrands]);

const readIsoBaseMediaBrands = (buffer: Buffer): string[] => {
  if (buffer.byteLength < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
    return [];
  }

  const brands: string[] = [buffer.subarray(8, 12).toString("ascii")];

  for (let offset = 16; offset + 4 <= Math.min(buffer.byteLength, 64); offset += 4) {
    brands.push(buffer.subarray(offset, offset + 4).toString("ascii"));
  }

  return brands;
};

export const isHeicImage = (buffer: Buffer): boolean =>
  readIsoBaseMediaBrands(buffer).some((brand) => heicBrands.has(brand));

export const isHeifImage = (buffer: Buffer): boolean =>
  readIsoBaseMediaBrands(buffer).some((brand) => heifBrands.has(brand));

export const isTiffImage = (buffer: Buffer): boolean => {
  if (buffer.byteLength < 4) {
    return false;
  }

  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];

  // Classic TIFF: "II*\0" (little-endian) or "MM\0*" (big-endian).
  // BigTIFF:     "II+\0" or "MM\0+".
  if (b0 === 0x49 && b1 === 0x49 && (b2 === 0x2a || b2 === 0x2b) && b3 === 0x00) {
    return true;
  }

  return b0 === 0x4d && b1 === 0x4d && b2 === 0x00 && (b3 === 0x2a || b3 === 0x2b);
};

export const decodeHeifImageToPng = async (buffer: Buffer): Promise<Buffer> => {
  const decoded = await heicConvert({ buffer, format: "PNG" });

  return Buffer.from(decoded instanceof ArrayBuffer ? new Uint8Array(decoded) : decoded);
};

export const createSharpInputBuffer = async (buffer: Buffer): Promise<Buffer> =>
  isHeifImage(buffer) ? decodeHeifImageToPng(buffer) : buffer;
