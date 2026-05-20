import { Field, Input } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";

import { AppModal } from "../../components/layout";
import { formatBytes, formatDimensions } from "../../lib/format";
import type { Asset } from "../../types";

export function PhotoPickerModal({
  assets,
  eyebrow,
  onAddPhoto,
  onClose,
}: {
  assets: Asset[];
  eyebrow?: string;
  onAddPhoto: (asset: Asset) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAssets = useMemo(() => {
    if (!normalizedQuery) {
      return assets;
    }

    return assets.filter((asset) =>
      [asset.originalFilename, formatDimensions(asset), formatBytes(asset.byteSize)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [assets, normalizedQuery]);

  const addPhoto = (asset: Asset) => {
    onAddPhoto(asset);
    onClose();
  };

  return (
    <AppModal title="Add photo" {...(eyebrow === undefined ? {} : { eyebrow })} onClose={onClose}>
      <div className="photo-picker-modal">
        <div className="photo-picker-toolbar">
          <Field label="Search photos">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </Field>
          <span className="photo-picker-count">
            {visibleAssets.length} of {assets.length}
          </span>
        </div>
        {assets.length === 0 ? <p className="empty-state">No assets yet</p> : null}
        {assets.length > 0 && visibleAssets.length === 0 ? (
          <p className="empty-state">No photos match</p>
        ) : null}
        {visibleAssets.length > 0 ? (
          <div className="photo-picker-grid">
            {visibleAssets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className="photo-picker-item"
                aria-label={`Add ${asset.originalFilename}`}
                onClick={() => addPhoto(asset)}
              >
                <img src={asset.thumbnailUrl ?? asset.originalContentUrl} alt="" />
                <span className="photo-picker-item-copy">
                  <span>{asset.originalFilename}</span>
                  <span>
                    {formatDimensions(asset)} / {formatBytes(asset.byteSize)}
                  </span>
                </span>
                <span className="primary-button photo-picker-add-indicator">
                  <AddRegular />
                  Add
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
