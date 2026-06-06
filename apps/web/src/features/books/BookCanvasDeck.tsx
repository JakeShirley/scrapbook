import type { PageLayer } from "@scrapbook/editor-core";

import type { Asset, PageDetail } from "../../types";
import type { CanvasPoint } from "../editor/editorTypes";
import { type CanvasPreviewLayer, PageCanvas, type SelectLayerOptions } from "../editor/PageCanvas";
import type { LayerTransformUpdate } from "../editor/transforms";
import type { EditHistoryMode } from "./bookEditorHistory";
import type { ViewMode } from "./bookEditorTypes";

type BookCanvasDeckProps = {
  activePageId: string;
  assetById: Map<string, Asset>;
  orderedPageIds: string[];
  pageDetails: Map<string, PageDetail>;
  selectedLayerIds: string[];
  viewMode: ViewMode;
  visiblePageIds: string[];
  getSpreadPreviewLayers: (pageId: string) => CanvasPreviewLayer[];
  onDeleteLayer: (pageId: string, layerId: string) => void;
  onChooseWashiTapePhoto?: ((pageId: string, layerId: string) => void) | undefined;
  onDropAsset?: (pageId: string, assetId: string, canvasPoint: CanvasPoint) => void;
  onReorderLayer: (pageId: string, layerId: string, toIndex: number) => void;
  onSelectLayer: (pageId: string, layerId: string | null, options?: SelectLayerOptions) => void;
  onTransformEnd: (pageId: string, layerId: string, update: Partial<PageLayer> | null) => void;
  onTransformLayers: (pageId: string, updates: LayerTransformUpdate[]) => void;
  onTransformLayersEnd: (pageId: string, updates: LayerTransformUpdate[] | null) => void;
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
  selectedLayerIds,
  viewMode,
  visiblePageIds,
  getSpreadPreviewLayers,
  onDeleteLayer,
  onChooseWashiTapePhoto,
  onDropAsset,
  onReorderLayer,
  onSelectLayer,
  onTransformEnd,
  onTransformLayers,
  onTransformLayersEnd,
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
              selectedLayerIds={pageId === activePageId ? selectedLayerIds : []}
              onChangeLayer={(layerId, update) => onUpdateLayerTransform(pageId, layerId, update)}
              onChooseWashiTapePhoto={(layerId) => onChooseWashiTapePhoto?.(pageId, layerId)}
              onDeleteLayer={(layerId) => onDeleteLayer(pageId, layerId)}
              {...(onDropAsset
                ? { onDropAsset: (assetId, point) => onDropAsset(pageId, assetId, point) }
                : {})}
              onReorderLayer={(layerId, toIndex) => onReorderLayer(pageId, layerId, toIndex)}
              onSelectPreviewLayer={onSelectLayer}
              onSelectLayer={(layerId, options) => onSelectLayer(pageId, layerId, options)}
              onTransformEnd={(layerId, update) => onTransformEnd(pageId, layerId, update)}
              onTransformLayer={(layerId, update) =>
                onUpdateLayerTransform(pageId, layerId, update, "group")
              }
              onTransformLayers={(updates) => onTransformLayers(pageId, updates)}
              onTransformLayersEnd={(updates) => onTransformLayersEnd(pageId, updates)}
            />
          </section>
        );
      })}
    </div>
  );
}
