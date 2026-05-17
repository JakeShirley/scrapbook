import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export type StaticAsset = {
  body: ArrayBuffer;
  contentType: string;
};

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const safeDecodePath = (pathname: string): string | null => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
};

const resolveAssetPath = (rootDir: string, pathname: string): string | null => {
  const decodedPath = safeDecodePath(pathname);

  if (!decodedPath || decodedPath.includes("\\")) {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const absoluteRoot = resolve(rootDir);
  const absolutePath = resolve(absoluteRoot, relativePath);

  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${sep}`)) {
    return null;
  }

  return absolutePath;
};

const readAsset = async (absolutePath: string): Promise<StaticAsset | null> => {
  try {
    const buffer = await readFile(absolutePath);
    const extension = extname(absolutePath).toLowerCase();

    return {
      body: toArrayBuffer(buffer),
      contentType: contentTypes[extension] ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
};

export const readStaticAsset = async (
  rootDir: string,
  pathname: string,
): Promise<StaticAsset | null> => {
  if (pathname.startsWith("/api/")) {
    return null;
  }

  const assetPath = resolveAssetPath(rootDir, pathname);
  const indexPath = resolveAssetPath(rootDir, "/");

  if (!assetPath || !indexPath) {
    return null;
  }

  return (await readAsset(assetPath)) ?? readAsset(indexPath);
};
