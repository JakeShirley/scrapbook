import { Button } from "@fluentui/react-components";
import { AddRegular, TextTRegular } from "@fluentui/react-icons";
import type { CSSProperties } from "react";

import { type EmbellishmentPreset, embellishmentPresets } from "./embellishments";

export function AssetRail({
  assetCount,
  isPhotoPickerDisabled = false,
  onAddEmbellishment,
  onAddText,
  onOpenPhotoPicker,
}: {
  assetCount: number;
  isPhotoPickerDisabled?: boolean;
  onAddEmbellishment: (preset: EmbellishmentPreset) => void;
  onAddText: () => void;
  onOpenPhotoPicker: () => void;
}) {
  return (
    <aside className="editor-panel editor-asset-rail" aria-label="Photos">
      <div className="panel-heading compact-heading">
        <h3>Photos</h3>
        <span>{assetCount}</span>
      </div>
      <div className="asset-rail-actions">
        <Button
          appearance="primary"
          type="button"
          className="primary-button full-width-button"
          disabled={isPhotoPickerDisabled}
          icon={<AddRegular />}
          onClick={onOpenPhotoPicker}
        >
          Add photo
        </Button>
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
