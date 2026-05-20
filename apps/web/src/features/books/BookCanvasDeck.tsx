import type { PageLayer } from "@scrapbook/editor-core";

import type { Asset, PageDetail } from "../../types";
import { PageCanvas } from "../editor/PageCanvas";
import type { EditHistoryMode } from "./bookEditorHistory";
import type { ViewMode } from "./bookEditorTypes";

type BookCanvasDeckProps = {
  activePageId: string;
  assetById: Map<string, Asset>;
  orderedPageIds: string[];
  pageDetails: Map<string, PageDetail>;
  selectedLayerId: string | null;
  viewMode: ViewMode;
  visiblePageIds: string[];
  getSpreadPreviewLayers: (pageId: string) => PageLayer[];
  onDeleteLayer: (pageId: string, layerId: string) => void;
  onReorderLayer: (pageId: string, layerId: string, toIndex: number) => void;
  onSelectLayer: (pageId: string, layerId: string | null) => void;
  onTransformEnd: (pageId: string, layerId: string, update: Partial<PageLayer> | null) => void;
  onUpdateLayerTransform: (
    pageId: string,
    layerId: string,
    update: Partial<PageLayer>,
    historyMode?: EditHistoryMode,
  ) => void;
};

export function BookCanvasDeck({
  activePageId,
  assetById,
  orderedPageIds,
  pageDetails,
  selectedLayerId,
  viewMode,
  visiblePageIds,
  getSpreadPreviewLayers,
  onDeleteLayer,
  onReorderLayer,
  onSelectLayer,
  onTransformEnd,
  onUpdateLayerTransform,
}: BookCanvasDeckProps) {
  return (
    <div className="book-canvas-deck" data-mode={viewMode}>
      {visiblePageIds.map((pageId) => {
        const page = pageDetails.get(pageId);
        const pageIndex = orderedPageIds.indexOf(pageId);

        if (!page) {
          return null;
        }

        return (
          <section
            className="book-page-frame"
            data-active={pageId === activePageId}
            key={pageId}
            aria-label={`Page ${pageIndex + 1}`}
          >
            <PageCanvas
              assetById={assetById}
              document={page.document}
              previewLayers={getSpreadPreviewLayers(pageId)}
              selectedLayerId={pageId === activePageId ? selectedLayerId : null}
              onChangeLayer={(layerId, update) => onUpdateLayerTransform(pageId, layerId, update)}
              onDeleteLayer={(layerId) => onDeleteLayer(pageId, layerId)}
              onReorderLayer={(layerId, toIndex) => onReorderLayer(pageId, layerId, toIndex)}
              onSelectLayer={(layerId) => onSelectLayer(pageId, layerId)}
              onTransformEnd={(layerId, update) => onTransformEnd(pageId, layerId, update)}
              onTransformLayer={(layerId, update) =>
                onUpdateLayerTransform(pageId, layerId, update, "group")
              }
            />
          </section>
        );
      })}
    </div>
  );
}
