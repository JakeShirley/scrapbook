import { type PageDocument, type PhotoLayer, renderPageDocumentSvg } from "@scrapbook/editor-core";

import type { Repositories } from "../persistence/repositories.js";
import type { PageRecord } from "../persistence/schema.js";
import type { ExportStorage } from "./types.js";

export const parsePageDocument = async (page: PageRecord): Promise<PageDocument> => {
  const { pageDocumentSchema } = await import("@scrapbook/editor-core");

  return pageDocumentSchema.parse(JSON.parse(page.documentJson));
};

export const renderPageSvg = async (input: {
  accountId: string;
  document: PageDocument;
  repositories: Repositories;
  storage: ExportStorage;
}): Promise<string> => {
  const photoHrefs = new Map<string, string>();

  for (const layer of input.document.layers) {
    if (layer.kind === "photo") {
      const asset = input.repositories.assets.findByIdForAccount(input.accountId, layer.assetId);

      if (!asset) {
        continue;
      }

      const buffer = await input.storage.read(asset.originalStorageKey);

      photoHrefs.set(layer.id, `data:${asset.mimeType};base64,${buffer.toString("base64")}`);
    }
  }

  return renderPageDocumentSvg(input.document, {
    resolvePhotoHref: (layer: PhotoLayer) => photoHrefs.get(layer.id),
  });
};
