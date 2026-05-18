import {
  deleteLayer,
  duplicateLayer,
  type PageDocument,
  reorderLayer,
} from "@scrapbook/editor-core";

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
            <button
              type="button"
              disabled={layerIndex === 0}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex - 1))}
            >
              Up
            </button>
            <button
              type="button"
              disabled={layerIndex === document.layers.length - 1}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex + 1))}
            >
              Down
            </button>
            <button type="button" onClick={() => onChange(duplicateLayer(document, layer.id))}>
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(deleteLayer(document, layer.id));
                onSelectLayer(null);
              }}
            >
              Del
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
