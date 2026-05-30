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

export const decodeHeifImageToPng = async (buffer: Buffer): Promise<Buffer> => {
  const decoded = await heicConvert({ buffer, format: "PNG" });

  return Buffer.from(decoded instanceof ArrayBuffer ? new Uint8Array(decoded) : decoded);
};

export const createSharpInputBuffer = async (buffer: Buffer): Promise<Buffer> =>
  isHeifImage(buffer) ? decodeHeifImageToPng(buffer) : buffer;
