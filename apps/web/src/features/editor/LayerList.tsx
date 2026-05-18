import { Button } from "@fluentui/react-components";
import {
  deleteLayer,
  duplicateLayer,
  type PageDocument,
  reorderLayer,
} from "@scrapbook/editor-core";
import {
  ArrowDownRegular,
  ArrowUpRegular,
  CopyRegular,
  DeleteRegular,
} from "@fluentui/react-icons";

export function LayerList({
  document,
  selectedLayerId,
  onChange,
  onSelectLayer,
}: {
  document: PageDocument;
  selectedLayerId: string | null;
  onChange: (document: PageDocument) => void;
  onSelectLayer: (layerId: string | null) => void;
}) {
  return (
    <ol className="layer-list">
      {document.layers.map((layer, layerIndex) => (
        <li key={layer.id} data-selected={layer.id === selectedLayerId}>
          <button type="button" className="layer-select" onClick={() => onSelectLayer(layer.id)}>
            <span>{layer.name}</span>
            <span>{layer.kind}</span>
          </button>
          <div className="layer-actions">
            <Button
              type="button"
              icon={<ArrowUpRegular />}
              size="small"
              disabled={layerIndex === 0}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex - 1))}
            >
              Up
            </Button>
            <Button
              type="button"
              icon={<ArrowDownRegular />}
              size="small"
              disabled={layerIndex === document.layers.length - 1}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex + 1))}
            >
              Down
            </Button>
            <Button
              type="button"
              icon={<CopyRegular />}
              size="small"
              onClick={() => onChange(duplicateLayer(document, layer.id))}
            >
              Copy
            </Button>
            <Button
              type="button"
              icon={<DeleteRegular />}
              size="small"
              onClick={() => {
                onChange(deleteLayer(document, layer.id));
                onSelectLayer(null);
              }}
            >
              Del
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}
