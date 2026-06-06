import { Button } from "@fluentui/react-components";
import {
  AddRegular,
  EmojiSparkleRegular,
  ImageAddRegular,
  TextTRegular,
} from "@fluentui/react-icons";
import { stickerLibrarySummaries } from "@scrapbook/editor-core";
import type { CSSProperties } from "react";

import type { Asset } from "../../types";
import { type EmbellishmentPreset, embellishmentPresets } from "./embellishments";

type AssetRailCommonProps = {
  isPhotoPickerDisabled?: boolean;
  isStickerPickerDisabled?: boolean;
  onAddEmbellishment: (preset: EmbellishmentPreset) => void;
  onAddText: () => void;
  onOpenStickerPicker: () => void;
  onOpenWashiTapePicker: () => void;
};

type AssetRailModalProps = AssetRailCommonProps & {
  mode?: "modal";
  assetCount: number;
  onOpenPhotoPicker: () => void;
};

type AssetRailReferencedProps = AssetRailCommonProps & {
  mode: "referenced";
  referencedAssets: Asset[];
  onOpenLibraryPicker: () => void;
};

export type AssetRailProps = AssetRailModalProps | AssetRailReferencedProps;

export const assetDragMimeType = "application/x-scrapbook-asset-id";

export function AssetRail(props: AssetRailProps) {
  const {
    isPhotoPickerDisabled = false,
    isStickerPickerDisabled = false,
    onAddEmbellishment,
    onAddText,
    onOpenStickerPicker,
    onOpenWashiTapePicker,
  } = props;
  const isReferencedMode = props.mode === "referenced";
  const photoCount = isReferencedMode ? props.referencedAssets.length : props.assetCount;

  return (
    <aside className="editor-panel editor-asset-rail" aria-label="Assets">
      <div className="panel-heading compact-heading">
        <h3>Photos</h3>
        <span>{photoCount}</span>
      </div>
      <div className="asset-rail-actions">
        {isReferencedMode ? (
          <Button
            appearance="primary"
            type="button"
            className="primary-button full-width-button"
            icon={<ImageAddRegular />}
            onClick={props.onOpenLibraryPicker}
          >
            Get more photos
          </Button>
        ) : (
          <Button
            appearance="primary"
            type="button"
            className="primary-button full-width-button"
            disabled={isPhotoPickerDisabled}
            icon={<AddRegular />}
            onClick={props.onOpenPhotoPicker}
          >
            Add photo
          </Button>
        )}
        <Button
          type="button"
          className="secondary-button full-width-button"
          disabled={isPhotoPickerDisabled}
          icon={<AddRegular />}
          onClick={onOpenWashiTapePicker}
        >
          Add washi tape
        </Button>
      </div>
      {isReferencedMode ? (
        <ul className="asset-rail-photos" aria-label="Photos referenced by this book">
          {props.referencedAssets.length === 0 ? (
            <li className="asset-rail-photos-empty-item">
              <p className="asset-rail-photos-empty">
                No photos yet. Click <em>Get more photos</em> to add some from your library.
              </p>
            </li>
          ) : (
            props.referencedAssets.map((asset) => {
              const isDisabled = isPhotoPickerDisabled;
              return (
                <li key={asset.id} className="asset-rail-photo-item">
                  <button
                    type="button"
                    className="asset-rail-photo"
                    title={`Drag ${asset.originalFilename} onto the page`}
                    aria-label={`Drag ${asset.originalFilename} onto the page`}
                    disabled={isDisabled}
                    draggable={!isDisabled}
                    onDragStart={(event) => {
                      if (isDisabled) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(assetDragMimeType, asset.id);
                      event.dataTransfer.setData("text/plain", asset.id);
                    }}
                  >
                    <img
                      src={asset.thumbnailUrl ?? asset.originalContentUrl}
                      alt=""
                      draggable={false}
                    />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
      <div className="panel-heading compact-heading nested-heading">
        <h3>Stickers</h3>
        <span>{stickerLibrarySummaries.length} packs</span>
      </div>
      <div className="asset-rail-actions">
        <Button
          type="button"
          className="secondary-button full-width-button"
          disabled={isStickerPickerDisabled}
          icon={<EmojiSparkleRegular />}
          onClick={onOpenStickerPicker}
        >
          Add sticker
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
            <span>{preset.displayName}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
