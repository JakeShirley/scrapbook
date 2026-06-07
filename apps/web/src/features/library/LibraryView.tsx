import { Button } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowUploadRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
} from "@fluentui/react-icons";
import type { ChangeEvent, DragEvent as ReactDragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiClient } from "../../apiClient";
import { Panel, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import { formatBytes, formatDimensions } from "../../lib/format";
import type { Album, Asset } from "../../types";
import { AlbumAssetPickerModal } from "./AlbumAssetPickerModal";
import { AlbumChipBar } from "./AlbumChipBar";
import { AlbumDeleteModal } from "./AlbumDeleteModal";
import { AlbumNameModal } from "./AlbumNameModal";
import { PhotoInfoModal } from "./PhotoInfoModal";

type SortMode = "taken" | "uploaded";

const sortModeLabels: Record<SortMode, string> = {
  taken: "Date taken (newest)",
  uploaded: "Date uploaded (newest)",
};

const sortKeyFor = (asset: Asset, mode: SortMode): string =>
  mode === "taken" ? (asset.dateTaken ?? asset.createdAt) : asset.createdAt;

type AlbumDialog =
  | { kind: "create" }
  | { kind: "rename"; album: Album }
  | { kind: "delete"; album: Album }
  | { kind: "addPhotos"; album: Album };

export function LibraryView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumAssets, setAlbumAssets] = useState<Asset[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("taken");
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<AlbumDialog | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAlbum = useMemo(
    () => (selectedAlbumId ? (albums.find((album) => album.id === selectedAlbumId) ?? null) : null),
    [albums, selectedAlbumId],
  );

  const visibleAssets = useMemo(() => {
    if (selectedAlbumId === null) {
      return assets;
    }
    return albumAssets ?? [];
  }, [selectedAlbumId, assets, albumAssets]);

  const sortedAssets = useMemo(
    () =>
      [...visibleAssets].sort((a, b) =>
        sortKeyFor(b, sortMode).localeCompare(sortKeyFor(a, sortMode)),
      ),
    [visibleAssets, sortMode],
  );

  const inspectedAsset = useMemo(
    () =>
      inspectedAssetId ? (assets.find((asset) => asset.id === inspectedAssetId) ?? null) : null,
    [assets, inspectedAssetId],
  );

  const refreshAlbums = useCallback(async () => {
    const response = await apiClient.listAlbums();
    setAlbums(response.albums);
    return response.albums;
  }, []);

  const loadAlbumAssets = useCallback(async (albumId: string) => {
    setIsAlbumLoading(true);
    try {
      const response = await apiClient.listAlbumAssets(albumId);
      setAlbumAssets(response.assets);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setAlbumAssets([]);
    } finally {
      setIsAlbumLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([apiClient.listAssets(), apiClient.listAlbums()])
      .then(([assetResponse, albumResponse]) => {
        if (isMounted) {
          setAssets(assetResponse.assets);
          setAlbums(albumResponse.albums);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedAlbumId === null) {
      setAlbumAssets(null);
      return;
    }
    loadAlbumAssets(selectedAlbumId);
  }, [selectedAlbumId, loadAlbumAssets]);

  const uploadAssets = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setError(null);
    setUploadProgress(0);

    const uploadedAssets: Asset[] = [];
    const failures: string[] = [];

    for (const [fileIndex, file] of files.entries()) {
      try {
        const asset = await apiClient.uploadAsset(file, (fileProgress) => {
          setUploadProgress((fileIndex + (fileProgress ?? 0)) / files.length);
        });

        uploadedAssets.push(asset);
      } catch (uploadError: unknown) {
        failures.push(`${file.name}: ${getErrorMessage(uploadError)}`);
      } finally {
        setUploadProgress((fileIndex + 1) / files.length);
      }
    }

    if (uploadedAssets.length > 0) {
      const uploadedAssetIds = new Set(uploadedAssets.map((asset) => asset.id));
      const uploadedAssetsNewestFirst = [...uploadedAssets].reverse();

      setAssets((currentAssets) => [
        ...uploadedAssetsNewestFirst,
        ...currentAssets.filter((asset) => !uploadedAssetIds.has(asset.id)),
      ]);

      if (selectedAlbumId !== null) {
        try {
          const response = await apiClient.addAlbumAssets(selectedAlbumId, {
            assetIds: uploadedAssets.map((asset) => asset.id),
          });
          setAlbumAssets(response.assets);
          await refreshAlbums();
        } catch (addError: unknown) {
          failures.push(getErrorMessage(addError));
        }
      }
    }

    setError(failures.length > 0 ? failures.join(" ") : null);
    setUploadProgress(null);
  };

  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const dragOverDepthRef = useRef(0);
  const hasFilesPayload = (event: ReactDragEvent<HTMLDivElement>): boolean =>
    Array.from(event.dataTransfer.types).includes("Files");
  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event)) return;
    dragOverDepthRef.current += 1;
    setIsFileDragOver(true);
  };
  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event)) return;
    dragOverDepthRef.current = Math.max(0, dragOverDepthRef.current - 1);
    if (dragOverDepthRef.current === 0) setIsFileDragOver(false);
  };
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event)) return;
    event.preventDefault();
    dragOverDepthRef.current = 0;
    setIsFileDragOver(false);
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    void uploadFiles(files);
  };

  const removeAssetFromAlbum = async (album: Album, asset: Asset) => {
    setError(null);
    try {
      await apiClient.removeAlbumAsset(album.id, asset.id);
      setAlbumAssets((current) =>
        current ? current.filter((member) => member.id !== asset.id) : current,
      );
      await refreshAlbums();
    } catch (removeError) {
      setError(getErrorMessage(removeError));
    }
  };

  const memberAssetIds = useMemo(
    () => new Set((albumAssets ?? []).map((asset) => asset.id)),
    [albumAssets],
  );

  const panelTitle = selectedAlbum ? selectedAlbum.title : "All photos";
  const panelCount = selectedAlbum ? String(selectedAlbum.photoCount) : String(assets.length);

  return (
    <>
      <WorkspaceHeader title="Library">
        <input
          ref={fileInputRef}
          accept="image/heic,image/heif,image/jpeg,image/png,image/tiff,image/webp,image/x-adobe-dng,.heic,.heif,.tif,.tiff,.dng,.raw"
          className="visually-hidden"
          multiple
          type="file"
          onChange={uploadAssets}
        />
        <Button
          type="button"
          className="secondary-button"
          disabled={uploadProgress !== null}
          icon={<ArrowUploadRegular />}
          onClick={() => fileInputRef.current?.click()}
        >
          {selectedAlbum ? `Upload to ${selectedAlbum.title}` : "Upload"}
        </Button>
      </WorkspaceHeader>

      <section
        className="workspace-grid library-grid"
        data-file-drop-target={isFileDragOver || undefined}
        aria-label="Photo library"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Panel title={panelTitle} count={panelCount}>
          {error ? (
            <p className="panel-alert" role="alert">
              {error}
            </p>
          ) : null}
          {uploadProgress !== null ? (
            <div className="upload-progress" aria-live="polite">
              <span>Uploading</span>
              <progress value={uploadProgress ?? undefined} max={1} />
            </div>
          ) : null}
          <AlbumChipBar
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            onSelectAlbum={setSelectedAlbumId}
            trailing={
              <Button
                type="button"
                className="secondary-button"
                icon={<AddRegular />}
                onClick={() => setDialog({ kind: "create" })}
              >
                New album
              </Button>
            }
          />
          {selectedAlbum ? (
            <div className="library-album-toolbar">
              <Button
                type="button"
                className="secondary-button"
                icon={<AddRegular />}
                onClick={() => setDialog({ kind: "addPhotos", album: selectedAlbum })}
              >
                Add photos
              </Button>
              <Button
                type="button"
                className="secondary-button"
                icon={<EditRegular />}
                onClick={() => setDialog({ kind: "rename", album: selectedAlbum })}
              >
                Rename
              </Button>
              <Button
                type="button"
                className="secondary-button"
                icon={<DeleteRegular />}
                onClick={() => setDialog({ kind: "delete", album: selectedAlbum })}
              >
                Delete album
              </Button>
            </div>
          ) : null}
          {isLoading ? <p className="empty-state">Loading assets</p> : null}
          {!isLoading && selectedAlbumId === null && assets.length === 0 ? (
            <p className="empty-state">No assets yet</p>
          ) : null}
          {!isLoading && selectedAlbumId !== null && isAlbumLoading ? (
            <p className="empty-state">Loading album</p>
          ) : null}
          {!isLoading &&
          selectedAlbumId !== null &&
          !isAlbumLoading &&
          (albumAssets?.length ?? 0) === 0 ? (
            <p className="empty-state">
              This album is empty. Use <strong>Add photos</strong> to fill it from your library.
            </p>
          ) : null}
          {!isLoading && visibleAssets.length > 0 ? (
            <>
              <div className="library-sort-toolbar">
                <label htmlFor="library-sort">
                  <span>Sort by</span>
                  <select
                    id="library-sort"
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
              </div>
              <div className="asset-grid">
                {sortedAssets.map((asset) => (
                  <div className="asset-tile-wrap" key={asset.id}>
                    <button
                      className="asset-tile"
                      type="button"
                      aria-label={`View info for ${asset.originalFilename}`}
                      onClick={() => setInspectedAssetId(asset.id)}
                    >
                      <img src={asset.thumbnailUrl ?? asset.originalContentUrl} alt="" />
                      <span className="asset-tile-copy">
                        <span>{asset.originalFilename}</span>
                        <span>
                          {formatDimensions(asset)} / {formatBytes(asset.byteSize)}
                        </span>
                      </span>
                    </button>
                    {selectedAlbum ? (
                      <button
                        type="button"
                        className="asset-tile-remove"
                        aria-label={`Remove ${asset.originalFilename} from ${selectedAlbum.title}`}
                        title="Remove from album"
                        onClick={() => removeAssetFromAlbum(selectedAlbum, asset)}
                      >
                        <DismissRegular />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
      </section>
      {inspectedAsset ? (
        <PhotoInfoModal
          asset={inspectedAsset}
          albums={albums}
          onAlbumMembershipChanged={() => {
            refreshAlbums();
            if (selectedAlbumId !== null) {
              loadAlbumAssets(selectedAlbumId);
            }
          }}
          onClose={() => setInspectedAssetId(null)}
        />
      ) : null}
      {dialog?.kind === "create" ? (
        <AlbumNameModal
          title="New album"
          initialName=""
          submitLabel="Create album"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const created = await apiClient.createAlbum({ title: name });
            await refreshAlbums();
            setSelectedAlbumId(created.id);
          }}
        />
      ) : null}
      {dialog?.kind === "rename" ? (
        <AlbumNameModal
          title="Rename album"
          initialName={dialog.album.title}
          submitLabel="Save"
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await apiClient.updateAlbum(dialog.album.id, { title: name });
            await refreshAlbums();
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <AlbumDeleteModal
          albumTitle={dialog.album.title}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await apiClient.deleteAlbum(dialog.album.id);
            setSelectedAlbumId(null);
            setAlbumAssets(null);
            await refreshAlbums();
          }}
        />
      ) : null}
      {dialog?.kind === "addPhotos" ? (
        <AlbumAssetPickerModal
          albumId={dialog.album.id}
          albumTitle={dialog.album.title}
          libraryAssets={assets}
          memberAssetIds={memberAssetIds}
          onAdded={async (memberAssets) => {
            setAlbumAssets(memberAssets);
            await refreshAlbums();
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
