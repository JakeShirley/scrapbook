import { Field, Input } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";

import { apiClient } from "../../apiClient";
import { AppModal } from "../../components/layout";
import { formatBytes, formatDimensions } from "../../lib/format";
import type { Album, Asset } from "../../types";
import { AlbumChipBar } from "../library/AlbumChipBar";

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
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumAssetIds, setAlbumAssetIds] = useState<Set<string> | null>(null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    apiClient
      .listAlbums()
      .then((response) => {
        if (isMounted) {
          setAlbums(response.albums);
        }
      })
      .catch(() => {
        // Album filter is optional; ignore errors so the picker still works.
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedAlbumId === null) {
      setAlbumAssetIds(null);
      return;
    }
    let isMounted = true;
    setIsAlbumLoading(true);
    apiClient
      .listAlbumAssets(selectedAlbumId)
      .then((response) => {
        if (isMounted) {
          setAlbumAssetIds(new Set(response.assets.map((asset) => asset.id)));
        }
      })
      .catch(() => {
        if (isMounted) {
          setAlbumAssetIds(new Set());
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsAlbumLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [selectedAlbumId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAssets = useMemo(() => {
    let pool = assets;
    if (selectedAlbumId !== null) {
      const ids = albumAssetIds;
      pool = ids ? pool.filter((asset) => ids.has(asset.id)) : [];
    }
    const filtered = normalizedQuery
      ? pool.filter((asset) =>
          [asset.originalFilename, formatDimensions(asset), formatBytes(asset.byteSize)]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : pool;

    return [...filtered].sort((a, b) =>
      sortKeyFor(b, sortMode).localeCompare(sortKeyFor(a, sortMode)),
    );
  }, [assets, normalizedQuery, sortMode, selectedAlbumId, albumAssetIds]);

  const filterPoolCount = selectedAlbumId === null ? assets.length : (albumAssetIds?.size ?? 0);

  const addPhoto = (asset: Asset) => {
    onAddPhoto(asset);
    onClose();
  };

  return (
    <AppModal title={title} onClose={onClose}>
      <div className="photo-picker-modal">
        <AlbumChipBar
          albums={albums}
          selectedAlbumId={selectedAlbumId}
          onSelectAlbum={setSelectedAlbumId}
        />
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
            {visibleAssets.length} of {filterPoolCount}
          </span>
        </div>
        {assets.length === 0 ? <p className="empty-state">No assets yet</p> : null}
        {assets.length > 0 && selectedAlbumId !== null && isAlbumLoading ? (
          <p className="empty-state">Loading album</p>
        ) : null}
        {assets.length > 0 && !isAlbumLoading && visibleAssets.length === 0 ? (
          <p className="empty-state">
            {selectedAlbumId === null ? "No photos match" : "No photos in this album match"}
          </p>
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
