import { Button, Field, Input } from "@fluentui/react-components";
import { AddRegular, CheckmarkCircleFilled, DismissRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";

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

export function BookLibraryPickerModal({
  bookId,
  referencedAssetIds,
  onAdded,
  onClose,
}: {
  bookId: string;
  referencedAssetIds: ReadonlySet<string>;
  onAdded: (referencedAssets: Asset[]) => void;
  onClose: () => void;
}) {
  const [libraryAssets, setLibraryAssets] = useState<Asset[] | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("taken");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    apiClient
      .listAssets()
      .then((response) => {
        if (isMounted) {
          setLibraryAssets(response.assets);
        }
      })
      .catch((listError: unknown) => {
        if (isMounted) {
          setLoadError(getErrorMessage(listError));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAssets = useMemo(() => {
    if (!libraryAssets) {
      return [];
    }
    const filtered = normalizedQuery
      ? libraryAssets.filter((asset) =>
          [asset.originalFilename, formatDimensions(asset), formatBytes(asset.byteSize)]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : libraryAssets;
    return [...filtered].sort((a, b) =>
      sortKeyFor(b, sortMode).localeCompare(sortKeyFor(a, sortMode)),
    );
  }, [libraryAssets, normalizedQuery, sortMode]);

  const selectableSelectedCount = useMemo(() => {
    let count = 0;
    for (const assetId of selectedAssetIds) {
      if (!referencedAssetIds.has(assetId)) {
        count += 1;
      }
    }
    return count;
  }, [selectedAssetIds, referencedAssetIds]);

  const toggleSelected = (asset: Asset) => {
    if (referencedAssetIds.has(asset.id)) {
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
      (assetId) => !referencedAssetIds.has(assetId),
    );

    if (assetIdsToAdd.length === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await apiClient.addBookAssets(bookId, { assetIds: assetIdsToAdd });
      onAdded(response.assets);
      onClose();
    } catch (addError: unknown) {
      setError(getErrorMessage(addError));
      setIsSubmitting(false);
    }
  };

  const title = "Add photos to this book";
  const totalLibraryCount = libraryAssets?.length ?? 0;

  return (
    <AppModal title={title} closeDisabled={isSubmitting} onClose={onClose}>
      <div className="photo-picker-modal book-library-picker-modal">
        <div className="photo-picker-toolbar">
          <Field label="Search photos">
            <Input
              type="search"
              value={query}
              disabled={libraryAssets === null}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </Field>
          <label className="photo-picker-sort" htmlFor="book-library-picker-sort">
            <span>Sort by</span>
            <select
              id="book-library-picker-sort"
              value={sortMode}
              disabled={libraryAssets === null}
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
            {libraryAssets === null
              ? "Loading..."
              : `${visibleAssets.length} of ${totalLibraryCount}`}
          </span>
        </div>
        {loadError ? (
          <p className="panel-alert" role="alert">
            {loadError}
          </p>
        ) : null}
        {libraryAssets === null && !loadError ? (
          <p className="empty-state">Loading your photo library</p>
        ) : null}
        {libraryAssets !== null && libraryAssets.length === 0 ? (
          <p className="empty-state">
            You haven&apos;t uploaded any photos yet. Upload one from the Library to add it here.
          </p>
        ) : null}
        {libraryAssets !== null && libraryAssets.length > 0 && visibleAssets.length === 0 ? (
          <p className="empty-state">No photos match</p>
        ) : null}
        {visibleAssets.length > 0 ? (
          <div className="photo-picker-grid">
            {visibleAssets.map((asset) => {
              const isAlreadyReferenced = referencedAssetIds.has(asset.id);
              const isSelected = selectedAssetIds.has(asset.id) || isAlreadyReferenced;

              return (
                <button
                  type="button"
                  key={asset.id}
                  className="photo-picker-item book-library-picker-item"
                  data-selected={isSelected || undefined}
                  data-locked={isAlreadyReferenced || undefined}
                  aria-pressed={isSelected}
                  aria-label={
                    isAlreadyReferenced
                      ? `${asset.originalFilename} (already in this book)`
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
                      {isAlreadyReferenced
                        ? "Already in this book"
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
                ? "Add to book"
                : `Add ${selectableSelectedCount} to book`}
            </Button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
