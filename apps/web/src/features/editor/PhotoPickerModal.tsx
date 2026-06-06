import { Field, Input } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";

import { AppModal } from "../../components/layout";
import { formatBytes, formatDimensions } from "../../lib/format";
import type { Asset } from "../../types";

type SortMode = "taken" | "uploaded";

const sortModeLabels: Record<SortMode, string> = {
  taken: "Date taken (newest)",
  uploaded: "Date uploaded (newest)",
};

const sortKeyFor = (asset: Asset, mode: SortMode): string =>
  mode === "taken" ? (asset.dateTaken ?? asset.createdAt) : asset.createdAt;

export function PhotoPickerModal({
  actionLabel = "Add",
  assets,
  onAddPhoto,
  onClose,
  title = "Add photo",
}: {
  actionLabel?: string;
  assets: Asset[];
  onAddPhoto: (asset: Asset) => void;
  onClose: () => void;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("taken");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAssets = useMemo(() => {
    const filtered = normalizedQuery
      ? assets.filter((asset) =>
          [asset.originalFilename, formatDimensions(asset), formatBytes(asset.byteSize)]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : assets;

    return [...filtered].sort((a, b) =>
      sortKeyFor(b, sortMode).localeCompare(sortKeyFor(a, sortMode)),
    );
  }, [assets, normalizedQuery, sortMode]);

  const addPhoto = (asset: Asset) => {
    onAddPhoto(asset);
    onClose();
  };

  return (
    <AppModal title={title} onClose={onClose}>
      <div className="photo-picker-modal">
        <div className="photo-picker-toolbar">
          <Field label="Search photos">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </Field>
          <label className="photo-picker-sort" htmlFor="photo-picker-sort">
            <span>Sort by</span>
            <select
              id="photo-picker-sort"
              value={sortMode}
              onChange={(event) => setSortMode(event.currentTarget.value as SortMode)}
            >
              {(Object.keys(sortModeLabels) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {sortModeLabels[mode]}
                </option>
              ))}
            </select>
          </label>
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
                aria-label={`${actionLabel} ${asset.originalFilename}`}
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
                  {actionLabel}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
