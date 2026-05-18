import type { StorageArea, StoredObject } from "../storage/disk.js";

type WritableExportArea = Extract<StorageArea, "exports">;

export type ExportStorage = {
  write: (
    area: WritableExportArea,
    data: Buffer,
    options?: { extension?: string },
  ) => Promise<StoredObject>;
  read: (key: string) => Promise<Buffer>;
  remove: (key: string) => Promise<void>;
};

export type RenderedExport = {
  buffer: Buffer;
  byteSize: number;
  checksumSha256: string;
  extension: string;
  mimeType: string;
};

export class ExportRenderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 500 = 400,
  ) {
    super(message);
    this.name = "ExportRenderError";
  }
}
