import { unzip, type Unzipped } from "fflate";

export type GoodnotesExtractedFile = File;

export type GoodnotesEntryTrace = {
  path: string;
  byteSize: number;
  /**
   * One-line description of what the extractor decided for this entry. Examples:
   * `accepted image/png`, `skipped (extension): .plist`, `skipped (thumbnail filename)`,
   * `skipped (unsupported image: PDF)`, `skipped (no image signature)`.
   */
  decision: string;
  /** First 16 bytes, formatted as hex + printable ASCII for debugging. */
  magic: string;
};

export type GoodnotesExtractionResult = {
  files: GoodnotesExtractedFile[];
  skipped: { unsupportedImage: number; nonImage: number };
  entries: GoodnotesEntryTrace[];
};

type DetectedType = {
  extension: ".png" | ".jpg" | ".webp" | ".gif" | ".svg" | ".heic" | ".jp2";
  mimeType:
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif"
    | "image/svg+xml"
    | "image/heic"
    | "image/jp2";
};

type DetectedUnsupportedType = {
  kind: "pdf";
};

const ascii = (bytes: Uint8Array, start: number, end: number): string => {
  let result = "";
  for (let i = start; i < end && i < bytes.length; i += 1) {
    result += String.fromCharCode(bytes[i] as number);
  }
  return result;
};

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean => {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
};

const looksLikeSvg = (bytes: Uint8Array): boolean => {
  const sample = ascii(bytes, 0, Math.min(bytes.length, 512))
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  return sample.startsWith("<?xml") || sample.startsWith("<svg");
};

const detectImage = (bytes: Uint8Array): DetectedType | DetectedUnsupportedType | null => {
  if (bytes.length < 4) return null;

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return { extension: ".gif", mimeType: "image/gif" };
  }
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return { extension: ".webp", mimeType: "image/webp" };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "heic" || brand === "heix" || brand === "mif1" || brand === "msf1") {
      // HEIC/HEIF gets sent through to the server uploader, which decodes it to PNG.
      return { extension: ".heic", mimeType: "image/heic" };
    }
  }
  // JPEG 2000 (JP2 container): signature box `\x00\x00\x00\x0CjP  \r\n\x87\n`.
  // Goodnotes archives use this format for embedded photo attachments.
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x00, 0x00, 0x00, 0x0c]) &&
    ascii(bytes, 4, 8) === "jP  " &&
    bytes[8] === 0x0d &&
    bytes[9] === 0x0a &&
    bytes[10] === 0x87 &&
    bytes[11] === 0x0a
  ) {
    return { extension: ".jp2", mimeType: "image/jp2" };
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { kind: "pdf" };
  }
  if (looksLikeSvg(bytes)) {
    return { extension: ".svg", mimeType: "image/svg+xml" };
  }

  return null;
};

const baseNameFor = (filePath: string): string => {
  const segments = filePath.split("/");
  const last = segments[segments.length - 1] ?? filePath;
  return last.length > 0 ? last : "sticker";
};

const stripExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return name;
  return name.slice(0, dotIndex);
};

const unzipAsync = (input: Uint8Array): Promise<Unzipped> =>
  new Promise((resolve, reject) => {
    unzip(input, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });

export const isGoodnotesFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith(".goodnotes");

export const extractGoodnotesStickers = async (
  source: File,
): Promise<GoodnotesExtractionResult> => {
  const buffer = new Uint8Array(await source.arrayBuffer());

  let entries: Unzipped;
  try {
    entries = await unzipAsync(buffer);
  } catch (error) {
    throw new Error(
      `Could not read ${source.name} as a Goodnotes archive: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  const baseName = stripExtension(source.name) || "goodnotes";
  const files: File[] = [];
  const traces: GoodnotesEntryTrace[] = [];
  let unsupportedImage = 0;
  let nonImage = 0;
  let counter = 0;

  for (const [entryPath, entryData] of Object.entries(entries)) {
    const trace: GoodnotesEntryTrace = {
      path: entryPath,
      byteSize: entryData.length,
      decision: "",
      magic: formatMagic(entryData),
    };

    if (entryPath.endsWith("/")) {
      trace.decision = "skipped (directory entry)";
      traces.push(trace);
      continue;
    }
    if (entryData.length === 0) {
      trace.decision = "skipped (empty entry)";
      traces.push(trace);
      continue;
    }
    if (entryPath.endsWith(".plist")) {
      trace.decision = "skipped (.plist metadata)";
      traces.push(trace);
      continue;
    }
    if (entryPath.endsWith(".pb")) {
      trace.decision = "skipped (.pb stroke data)";
      traces.push(trace);
      continue;
    }
    const entryBaseName = baseNameFor(entryPath);
    // Goodnotes archives include a generated page thumbnail (and sometimes
    // per-document preview thumbnails) that aren't useful as stickers.
    if (/^thumbnail(\..+)?$/i.test(entryBaseName)) {
      trace.decision = "skipped (thumbnail filename)";
      traces.push(trace);
      continue;
    }

    const detected = detectImage(entryData);

    if (!detected) {
      trace.decision = "skipped (no recognized image signature)";
      traces.push(trace);
      nonImage += 1;
      continue;
    }

    if ("kind" in detected) {
      trace.decision = `skipped (unsupported image: ${detected.kind.toUpperCase()})`;
      traces.push(trace);
      unsupportedImage += 1;
      continue;
    }

    counter += 1;
    const trimmed = stripExtension(entryBaseName) || `${baseName}-${counter}`;
    const fileName = `${trimmed}${detected.extension}`;
    // Copy into a fresh buffer so the File owns memory that won't be reused by callers.
    const owned = new Uint8Array(entryData);
    files.push(new File([owned], fileName, { type: detected.mimeType }));
    trace.decision = `accepted ${detected.mimeType} as ${fileName}`;
    traces.push(trace);
  }

  return { files, skipped: { unsupportedImage, nonImage }, entries: traces };
};

const formatMagic = (bytes: Uint8Array): string => {
  const sliceLength = Math.min(bytes.length, 16);
  if (sliceLength === 0) return "(empty)";
  const slice = bytes.subarray(0, sliceLength);
  let hex = "";
  let printable = "";
  for (let i = 0; i < sliceLength; i += 1) {
    const byte = slice[i] as number;
    hex += byte.toString(16).padStart(2, "0");
    if (i < sliceLength - 1) hex += " ";
    printable += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".";
  }
  return `${hex}  |  ${printable}`;
};

export const formatGoodnotesDiagnostics = (
  source: File,
  result: GoodnotesExtractionResult,
): string => {
  const lines: string[] = [];
  lines.push(`Goodnotes archive: ${source.name}`);
  lines.push(`Archive size: ${source.size} bytes`);
  lines.push(
    `Result: accepted=${result.files.length}, unsupportedImage=${result.skipped.unsupportedImage}, nonImage=${result.skipped.nonImage}`,
  );
  lines.push(`Total entries: ${result.entries.length}`);
  lines.push("");
  for (const entry of result.entries) {
    lines.push(`- ${entry.path}`);
    lines.push(`    size:    ${entry.byteSize} bytes`);
    lines.push(`    magic:   ${entry.magic}`);
    lines.push(`    result:  ${entry.decision}`);
  }
  return lines.join("\n");
};
