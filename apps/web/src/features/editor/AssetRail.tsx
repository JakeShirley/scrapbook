import { TextTRegular } from "@fluentui/react-icons";
import type { CSSProperties } from "react";

import type { Asset } from "../../types";
import { type EmbellishmentPreset, embellishmentPresets } from "./embellishments";

export function AssetRail({
  assets,
  onAddEmbellishment,
  onAddPhoto,
  onAddText,
}: {
  assets: Asset[];
  onAddEmbellishment: (preset: EmbellishmentPreset) => void;
  onAddPhoto: (asset: Asset) => void;
  onAddText: () => void;
}) {
  return (
    <aside className="editor-panel editor-asset-rail" aria-label="Assets">
      <div className="panel-heading compact-heading">
        <h3>Assets</h3>
        <span>{assets.length}</span>
      </div>
      <div className="asset-rail-list">
        {assets.length === 0 ? <p className="empty-state">No assets yet</p> : null}
        {assets.map((asset) => (
          <button
            type="button"
            key={asset.id}
            className="asset-rail-item"
            onClick={() => onAddPhoto(asset)}
          >
            <img src={asset.thumbnailUrl ?? asset.originalContentUrl} alt="" />
            <span>{asset.originalFilename}</span>
          </button>
        ))}
      </div>
      <div className="panel-heading compact-heading nested-heading">
        <h3>Elements</h3>
        <span>{embellishmentPresets.length + 1}</span>
      </div>
      <div className="asset-rail-list">
        <button type="button" className="element-rail-item" onClick={onAddText}>
          <span className="element-preview text-element-preview" aria-hidden="true">
            <TextTRegular />
          </span>
          <span>Text</span>
        </button>
        {embellishmentPresets.map((preset) => (
          <button
            type="button"
            key={preset.element}
            className="element-rail-item"
            onClick={() => onAddEmbellishment(preset)}
          >
            <span
              className="element-preview"
              data-element={preset.element}
              style={
                {
                  "--element-accent": preset.accentColor,
                  "--element-color": preset.color,
                } as CSSProperties
              }
            />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
