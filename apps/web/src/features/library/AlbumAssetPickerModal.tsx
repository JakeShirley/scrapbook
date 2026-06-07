import { Button, Field, Input } from "@fluentui/react-components";
import { AddRegular, CheckmarkCircleFilled, DismissRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";

import { apiClient } from "../../apiClient";
import { AppModal } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import { formatBytes, formatDimensions } from "../../lib/format";
import type { Asset } from "../../types";

type SortMode = "taken" | "uploaded";

const sortModeLabels: Record<SortMode, string> = {
  taken: "Date taken (newest)",
  uploaded: "Date uploaded (newest)",
};

const sortKeyFor = (asset: Asset, mode: SortMode): string =>
  mode === "taken" ? (asset.dateTaken ?? asset.createdAt) : asset.createdAt;

export function AlbumAssetPickerModal({
  albumId,
  albumTitle,
  libraryAssets,
  memberAssetIds,
  onAdded,
  onClose,
}: {
  albumId: string;
  albumTitle: string;
  libraryAssets: Asset[];
  memberAssetIds: ReadonlySet<string>;
  onAdded: (memberAssets: Asset[]) => void;
  onClose: () => void;
}) {
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("taken");
  const [hideUsed, setHideUsed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAssets = useMemo(() => {
    let filtered = libraryAssets;
    if (hideUsed) {
      filtered = filtered.filter((asset) => !memberAssetIds.has(asset.id));
    }
    if (normalizedQuery) {
      filtered = filtered.filter((asset) =>
        [asset.originalFilename, formatDimensions(asset), formatBytes(asset.byteSize)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      );
    }
    return [...filtered].sort((a, b) =>
      sortKeyFor(b, sortMode).localeCompare(sortKeyFor(a, sortMode)),
    );
  }, [libraryAssets, normalizedQuery, sortMode, hideUsed, memberAssetIds]);

  const selectableSelectedCount = useMemo(() => {
    let count = 0;
    for (const assetId of selectedAssetIds) {
      if (!memberAssetIds.has(assetId)) {
        count += 1;
      }
    }
    return count;
  }, [selectedAssetIds, memberAssetIds]);

  const toggleSelected = (asset: Asset) => {
    if (memberAssetIds.has(asset.id)) {
      return;
    }
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.add(asset.id);
      }
      return next;
    });
  };

  const submit = async () => {
    const assetIdsToAdd = Array.from(selectedAssetIds).filter(
      (assetId) => !memberAssetIds.has(assetId),
    );
    if (assetIdsToAdd.length === 0) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await apiClient.addAlbumAssets(albumId, { assetIds: assetIdsToAdd });
      onAdded(response.assets);
      onClose();
    } catch (addError: unknown) {
      setError(getErrorMessage(addError));
      setIsSubmitting(false);
    }
  };

  const totalLibraryCount = libraryAssets.length;

  return (
    <AppModal title={`Add photos to ${albumTitle}`} closeDisabled={isSubmitting} onClose={onClose}>
      <div className="photo-picker-modal book-library-picker-modal">
        <div className="photo-picker-toolbar">
          <Field label="Search photos">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </Field>
          <label className="photo-picker-sort" htmlFor="album-asset-picker-sort">
            <span>Sort by</span>
            <select
              id="album-asset-picker-sort"
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
          <label className="checkbox-label photo-picker-hide-used">
            <input
              type="checkbox"
              checked={hideUsed}
              onChange={(event) => setHideUsed(event.currentTarget.checked)}
            />
            <span>Hide photos already in this album</span>
          </label>
          <span className="photo-picker-count">
            <span aria-hidden="true" className="photo-picker-count-reserve">
              {`${totalLibraryCount} of ${totalLibraryCount}`}
            </span>
            <span className="photo-picker-count-value">
              {`${visibleAssets.length} of ${totalLibraryCount}`}
            </span>
          </span>
        </div>
        {libraryAssets.length === 0 ? (
          <p className="empty-state">
            You haven&apos;t uploaded any photos yet. Upload one from the Library to add it here.
          </p>
        ) : null}
        {libraryAssets.length > 0 && visibleAssets.length === 0 ? (
          <p className="empty-state">No photos match</p>
        ) : null}
        {visibleAssets.length > 0 ? (
          <div className="photo-picker-grid">
            {visibleAssets.map((asset) => {
              const isAlreadyMember = memberAssetIds.has(asset.id);
              const isSelected = selectedAssetIds.has(asset.id) || isAlreadyMember;

              return (
                <button
                  type="button"
                  key={asset.id}
                  className="photo-picker-item book-library-picker-item"
                  data-selected={isSelected || undefined}
                  data-locked={isAlreadyMember || undefined}
                  aria-pressed={isSelected}
                  aria-label={
                    isAlreadyMember
                      ? `${asset.originalFilename} (already in album)`
                      : isSelected
                        ? `Deselect ${asset.originalFilename}`
                        : `Select ${asset.originalFilename}`
                  }
                  onClick={() => toggleSelected(asset)}
                >
                  <span className="book-library-picker-thumb">
                    <img src={asset.thumbnailUrl ?? asset.originalContentUrl} alt="" />
                    {isSelected ? (
                      <span className="book-library-picker-check" aria-hidden="true">
                        <CheckmarkCircleFilled />
                      </span>
                    ) : null}
                  </span>
                  <span className="photo-picker-item-copy">
                    <span>{asset.originalFilename}</span>
                    <span>
                      {isAlreadyMember
                        ? "Already in album"
                        : `${formatDimensions(asset)} / ${formatBytes(asset.byteSize)}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="book-library-picker-footer">
          {error ? (
            <p className="panel-alert" role="alert">
              {error}
            </p>
          ) : null}
          <div className="book-library-picker-actions">
            <Button
              type="button"
              className="secondary-button"
              disabled={isSubmitting}
              icon={<DismissRegular />}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              appearance="primary"
              type="button"
              className="primary-button"
              disabled={isSubmitting || selectableSelectedCount === 0}
              icon={<AddRegular />}
              onClick={submit}
            >
              {selectableSelectedCount === 0
                ? "Add to album"
                : `Add ${selectableSelectedCount} to album`}
            </Button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
