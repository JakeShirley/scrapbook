import type { PageLayer } from "@scrapbook/editor-core";

import type { Asset, PageDetail } from "../../types";
import type { CanvasPoint } from "../editor/editorTypes";
import {
  type CanvasPreviewLayer,
  PageCanvas,
  type SelectionPanel,
  type SelectLayerOptions,
} from "../editor/PageCanvas";
import type { LayerTransformUpdate } from "../editor/transforms";
import type { EditHistoryMode } from "./bookEditorHistory";
import type { ViewMode } from "./bookEditorTypes";

type BookCanvasDeckProps = {
  activePageId: string;
  activeSelectionPanel?: SelectionPanel | null;
  assetById: Map<string, Asset>;
  orderedPageIds: string[];
  pageDetails: Map<string, PageDetail>;
  selectedLayerIds: string[];
  viewMode: ViewMode;
  visiblePageIds: string[];
  getSpreadPreviewLayers: (pageId: string) => CanvasPreviewLayer[];
  onActiveSelectionPanelChange?: (panel: SelectionPanel | null) => void;
  onDeleteLayer: (pageId: string, layerId: string) => void;
  onDropAsset?: (pageId: string, assetId: string, canvasPoint: CanvasPoint) => void;
  onDropFiles?: (pageId: string, files: File[], canvasPoint: CanvasPoint) => void;
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
  activeSelectionPanel,
  assetById,
  orderedPageIds,
  pageDetails,
  selectedLayerIds,
  viewMode,
  visiblePageIds,
  getSpreadPreviewLayers,
  onActiveSelectionPanelChange,
  onDeleteLayer,
  onDropAsset,
  onDropFiles,
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

        const isActivePage = pageId === activePageId;

        return (
          <section
            className="book-page-frame"
            data-active={isActivePage}
            key={pageId}
            aria-label={`Page ${pageIndex + 1}`}
          >
            <PageCanvas
              activeSelectionPanel={isActivePage ? (activeSelectionPanel ?? null) : null}
              assetById={assetById}
              document={page.document}
              previewLayers={getSpreadPreviewLayers(pageId)}
              selectedLayerIds={isActivePage ? selectedLayerIds : []}
              onActiveSelectionPanelChange={isActivePage ? onActiveSelectionPanelChange : undefined}
              onChangeLayer={(layerId, update) => onUpdateLayerTransform(pageId, layerId, update)}
              onDeleteLayer={(layerId) => onDeleteLayer(pageId, layerId)}
              {...(onDropAsset
                ? { onDropAsset: (assetId, point) => onDropAsset(pageId, assetId, point) }
                : {})}
              {...(onDropFiles
                ? { onDropFiles: (files, point) => onDropFiles(pageId, files, point) }
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
