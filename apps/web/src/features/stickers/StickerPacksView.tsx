import { Button } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowUploadRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  OpenRegular,
  StarFilled,
  StarRegular,
} from "@fluentui/react-icons";
import type { ChangeEvent, DragEvent as ReactDragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiClient } from "../../apiClient";
import { Panel, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import { formatBytes } from "../../lib/format";
import {
  extractGoodnotesStickers,
  formatGoodnotesDiagnostics,
  isGoodnotesFile,
} from "../../lib/goodnotesExtractor";
import { getStickerUsage, subscribeStickerUsage } from "../../lib/stickerUsage";
import type { CustomSticker, StickerPack } from "../../types";
import {
  FAVORITES_PACK_ID,
  StickerPackChipBar,
  type StickerPackSelection,
} from "./StickerPackChipBar";
import { StickerPackDeleteModal } from "./StickerPackDeleteModal";
import { type StickerPackSettings, StickerPackSettingsModal } from "./StickerPackSettingsModal";

type PackDialog =
  | { kind: "create" }
  | { kind: "edit"; pack: StickerPack }
  | { kind: "delete"; pack: StickerPack };

const supportedStickerMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "image/jp2",
  "image/jpx",
  "image/jpeg2000",
]);

const supportedStickerAccept =
  "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/heic,image/heif,image/jp2,image/jpx,.png,.jpg,.jpeg,.webp,.gif,.svg,.heic,.heif,.jp2,.jpx,.goodnotes";

type SortMode = "used" | "added" | "name";

const sortModeLabels: Record<SortMode, string> = {
  used: "Recently used",
  added: "Date added (newest)",
  name: "Name (A\u2013Z)",
};

const sortStickers = (
  stickers: CustomSticker[],
  mode: SortMode,
  usage: Record<string, number>,
): CustomSticker[] => {
  if (mode === "name") {
    return [...stickers].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }
  if (mode === "used") {
    return [...stickers].sort((a, b) => {
      const aUsed = usage[`custom:${a.id}`] ?? 0;
      const bUsed = usage[`custom:${b.id}`] ?? 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }
  return [...stickers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export function StickerPacksView() {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [stickers, setStickers] = useState<CustomSticker[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<StickerPackSelection>(null);
  const [sortMode, setSortMode] = useState<SortMode>("used");
  const [stickerUsage, setStickerUsage] = useState<Record<string, number>>(() => getStickerUsage());
  const [isLoading, setIsLoading] = useState(true);
  const [isStickersLoading, setIsStickersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [dialog, setDialog] = useState<PackDialog | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFavoritesView = selectedPackId === FAVORITES_PACK_ID;
  const editablePackId =
    typeof selectedPackId === "string" && !isFavoritesView ? selectedPackId : null;

  const selectedPack = useMemo(
    () => (editablePackId ? (packs.find((pack) => pack.id === editablePackId) ?? null) : null),
    [packs, editablePackId],
  );

  const refreshPacks = useCallback(async () => {
    const response = await apiClient.listStickerPacks();
    setPacks(response.packs);
    return response.packs;
  }, []);

  const loadStickers = useCallback(async (selection: StickerPackSelection) => {
    setIsStickersLoading(true);
    try {
      const response = await apiClient.listCustomStickers(
        selection === null || selection === FAVORITES_PACK_ID ? undefined : selection,
      );
      setStickers(response.stickers);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setStickers([]);
    } finally {
      setIsStickersLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all([apiClient.listStickerPacks(), apiClient.listCustomStickers()])
      .then(([packResponse, stickerResponse]) => {
        if (!isMounted) return;
        setPacks(packResponse.packs);
        setStickers(stickerResponse.stickers);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (isMounted) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void loadStickers(selectedPackId);
  }, [selectedPackId, loadStickers]);

  useEffect(() => subscribeStickerUsage(setStickerUsage), []);

  const uploadStickers = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (!editablePackId) {
      setError("Select a sticker pack before uploading.");
      return;
    }

    const packId = editablePackId;

    setError(null);
    setDiagnostics(null);
    setDiagnosticsCopied(false);
    setUploadProgress(0);

    const expanded: File[] = [];
    const failures: string[] = [];
    const diagnosticChunks: string[] = [];
    // Only count entries we genuinely couldn't recognize. PDFs and metadata
    // files (.plist / .pb / thumbnail) are expected non-image content in a
    // Goodnotes archive and aren't worth flagging to the user.
    let unrecognizedFromArchives = 0;

    for (const file of files) {
      if (!isGoodnotesFile(file)) {
        expanded.push(file);
        continue;
      }
      try {
        const result = await extractGoodnotesStickers(file);
        expanded.push(...result.files);
        unrecognizedFromArchives += result.skipped.nonImage;
        diagnosticChunks.push(formatGoodnotesDiagnostics(file, result));
      } catch (extractError: unknown) {
        failures.push(`${file.name}: ${getErrorMessage(extractError)}`);
        diagnosticChunks.push(
          `Goodnotes archive: ${file.name}\nArchive size: ${file.size} bytes\nError: ${getErrorMessage(extractError)}`,
        );
      }
    }

    if (expanded.length === 0) {
      const reasons: string[] = [];
      if (unrecognizedFromArchives > 0) {
        reasons.push(
          `No supported images were found in the Goodnotes archive (${unrecognizedFromArchives} ${unrecognizedFromArchives === 1 ? "entry" : "entries"} could not be recognized as an image).`,
        );
      }
      reasons.push(...failures);
      setError(reasons.length > 0 ? reasons.join(" ") : null);
      setDiagnostics(
        reasons.length > 0 && diagnosticChunks.length > 0 ? diagnosticChunks.join("\n\n") : null,
      );
      setUploadProgress(null);
      return;
    }

    const uploaded: CustomSticker[] = [];
    const seenStickerIds = new Set<string>();
    // Snapshot pack contents before the batch so server-deduped records (returned
    // when the same bytes already exist) are reported as duplicates even when
    // the entire batch is duplicates.
    const preExistingIds = new Set(stickers.map((sticker) => sticker.id));
    let duplicateUploads = 0;

    for (const [fileIndex, file] of expanded.entries()) {
      try {
        const sticker = await apiClient.uploadCustomSticker(packId, file, {
          onProgress: (fileProgress) => {
            setUploadProgress((fileIndex + (fileProgress ?? 0)) / expanded.length);
          },
        });
        const isDuplicate = preExistingIds.has(sticker.id) || seenStickerIds.has(sticker.id);
        if (isDuplicate) {
          duplicateUploads += 1;
        }
        if (!seenStickerIds.has(sticker.id)) {
          seenStickerIds.add(sticker.id);
          uploaded.push(sticker);
        }
      } catch (uploadError: unknown) {
        failures.push(`${file.name}: ${getErrorMessage(uploadError)}`);
      } finally {
        setUploadProgress((fileIndex + 1) / expanded.length);
      }
    }

    if (uploaded.length > 0) {
      const uploadedIds = new Set(uploaded.map((sticker) => sticker.id));
      setStickers((current) => [...current.filter((s) => !uploadedIds.has(s.id)), ...uploaded]);
      await refreshPacks();
    }

    const notices: string[] = [...failures];
    if (unrecognizedFromArchives > 0) {
      notices.push(
        `Skipped ${unrecognizedFromArchives} Goodnotes ${unrecognizedFromArchives === 1 ? "attachment that wasn't" : "attachments that weren't"} recognized as an image.`,
      );
    }
    if (duplicateUploads > 0) {
      notices.push(
        `${duplicateUploads} sticker${duplicateUploads === 1 ? " was" : "s were"} already in this pack and ${duplicateUploads === 1 ? "was" : "were"} skipped.`,
      );
    }
    setError(notices.length > 0 ? notices.join(" ") : null);
    setUploadProgress(null);
  };

  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const dragOverDepthRef = useRef(0);
  const hasFilesPayload = (event: ReactDragEvent<HTMLDivElement>): boolean =>
    Array.from(event.dataTransfer.types).includes("Files");
  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !editablePackId) return;
    dragOverDepthRef.current += 1;
    setIsFileDragOver(true);
  };
  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !editablePackId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !editablePackId) return;
    dragOverDepthRef.current = Math.max(0, dragOverDepthRef.current - 1);
    if (dragOverDepthRef.current === 0) setIsFileDragOver(false);
  };
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !editablePackId) return;
    event.preventDefault();
    dragOverDepthRef.current = 0;
    setIsFileDragOver(false);
    const files = Array.from(event.dataTransfer.files).filter(
      (file) => supportedStickerMimeTypes.has(file.type) || isGoodnotesFile(file),
    );
    if (files.length === 0) return;
    void uploadFiles(files);
  };

  const removeSticker = async (sticker: CustomSticker) => {
    setError(null);
    try {
      await apiClient.removeCustomSticker(sticker.packId, sticker.id);
      setStickers((current) => current.filter((candidate) => candidate.id !== sticker.id));
      await refreshPacks();
    } catch (removeError) {
      setError(getErrorMessage(removeError));
    }
  };

  const toggleFavorite = async (sticker: CustomSticker) => {
    const nextValue = !sticker.isFavorite;
    setError(null);
    setStickers((current) =>
      current.map((candidate) =>
        candidate.id === sticker.id ? { ...candidate, isFavorite: nextValue } : candidate,
      ),
    );
    try {
      const updated = await apiClient.setCustomStickerFavorite(sticker.id, {
        isFavorite: nextValue,
      });
      setStickers((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
    } catch (favoriteError) {
      setStickers((current) =>
        current.map((candidate) =>
          candidate.id === sticker.id
            ? { ...candidate, isFavorite: sticker.isFavorite }
            : candidate,
        ),
      );
      setError(getErrorMessage(favoriteError));
    }
  };

  const visibleStickers = useMemo(
    () =>
      sortStickers(
        isFavoritesView ? stickers.filter((sticker) => sticker.isFavorite) : stickers,
        sortMode,
        stickerUsage,
      ),
    [isFavoritesView, stickers, sortMode, stickerUsage],
  );
  const favoriteCount = useMemo(
    () => stickers.reduce((total, sticker) => total + (sticker.isFavorite ? 1 : 0), 0),
    [stickers],
  );

  const panelTitle = isFavoritesView
    ? "Favorites"
    : selectedPack
      ? selectedPack.title
      : "All stickers";
  const panelCount = isFavoritesView
    ? String(visibleStickers.length)
    : selectedPack
      ? String(selectedPack.stickerCount)
      : String(stickers.length);

  return (
    <>
      <WorkspaceHeader title="Stickers">
        <input
          ref={fileInputRef}
          accept={supportedStickerAccept}
          className="visually-hidden"
          multiple
          type="file"
          onChange={uploadStickers}
        />
        <Button
          type="button"
          className="secondary-button"
          disabled={uploadProgress !== null || !editablePackId}
          icon={<ArrowUploadRegular />}
          onClick={() => fileInputRef.current?.click()}
          title={editablePackId ? undefined : "Select a pack before uploading stickers"}
        >
          {selectedPack ? `Upload to ${selectedPack.title}` : "Upload"}
        </Button>
      </WorkspaceHeader>

      <section
        className="workspace-grid library-grid"
        data-file-drop-target={isFileDragOver || undefined}
        aria-label="Sticker library"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Panel title={panelTitle} count={panelCount}>
          {error ? (
            <div className="panel-alert" role="alert">
              <p>{error}</p>
              {diagnostics ? (
                <div className="panel-alert-actions">
                  <Button
                    type="button"
                    size="small"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(diagnostics);
                        setDiagnosticsCopied(true);
                        window.setTimeout(() => setDiagnosticsCopied(false), 2500);
                      } catch {
                        setDiagnosticsCopied(false);
                      }
                    }}
                  >
                    {diagnosticsCopied ? "Diagnostics copied" : "Copy diagnostics"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {uploadProgress !== null ? (
            <div className="upload-progress" aria-live="polite">
              <span>Uploading</span>
              <progress value={uploadProgress ?? undefined} max={1} />
            </div>
          ) : null}
          <StickerPackChipBar
            packs={packs}
            selectedPackId={selectedPackId}
            favoriteCount={favoriteCount}
            onSelectPack={setSelectedPackId}
            trailing={
              <Button
                type="button"
                className="secondary-button"
                icon={<AddRegular />}
                onClick={() => setDialog({ kind: "create" })}
              >
                New pack
              </Button>
            }
          />
          {selectedPack ? (
            <div className="library-album-toolbar sticker-pack-toolbar">
              {selectedPack.author ? (
                <span className="sticker-pack-meta">By {selectedPack.author}</span>
              ) : null}
              {selectedPack.sourceUrl ? (
                <a
                  className="sticker-pack-source-link"
                  href={selectedPack.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <OpenRegular />
                  <span>Source</span>
                </a>
              ) : null}
              <Button
                type="button"
                className="secondary-button"
                icon={<EditRegular />}
                onClick={() => setDialog({ kind: "edit", pack: selectedPack })}
              >
                Edit pack
              </Button>
              <Button
                type="button"
                className="secondary-button"
                icon={<DeleteRegular />}
                onClick={() => setDialog({ kind: "delete", pack: selectedPack })}
              >
                Delete pack
              </Button>
            </div>
          ) : null}
          {isLoading ? <p className="empty-state">Loading sticker packs</p> : null}
          {!isLoading && packs.length === 0 ? (
            <p className="empty-state">
              No sticker packs yet. Use <strong>New pack</strong> to create one, then upload images
              into it.
            </p>
          ) : null}
          {!isLoading && packs.length > 0 && isStickersLoading ? (
            <p className="empty-state">Loading stickers</p>
          ) : null}
          {!isLoading && packs.length > 0 && !isStickersLoading && visibleStickers.length === 0 ? (
            <p className="empty-state">
              {isFavoritesView
                ? "You haven't starred any stickers yet. Tap the star on a sticker to add it here."
                : selectedPack
                  ? "This pack is empty. Use Upload or drag images here to add stickers."
                  : "No stickers in any pack yet."}
            </p>
          ) : null}
          {!isLoading && visibleStickers.length > 0 ? (
            <>
              <div className="library-sort-toolbar">
                <label htmlFor="sticker-pack-sort">
                  <span>Sort by</span>
                  <select
                    id="sticker-pack-sort"
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
              <div className="asset-grid sticker-pack-grid">
                {visibleStickers.map((sticker) => {
                  const sourcePack = packs.find((pack) => pack.id === sticker.packId);
                  return (
                    <div className="asset-tile-wrap" key={sticker.id}>
                      <div className="asset-tile sticker-tile" title={sticker.name}>
                        <img
                          src={sticker.contentUrl}
                          alt={sticker.name}
                          loading="lazy"
                          decoding="async"
                        />
                        <span className="asset-tile-copy">
                          <span>{sticker.name}</span>
                          <span>
                            {sourcePack ? `${sourcePack.title} / ` : ""}
                            {formatBytes(sticker.byteSize)}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="asset-tile-favorite"
                        aria-label={
                          sticker.isFavorite
                            ? `Remove ${sticker.name} from favorites`
                            : `Add ${sticker.name} to favorites`
                        }
                        aria-pressed={sticker.isFavorite}
                        title={sticker.isFavorite ? "Unfavorite sticker" : "Favorite sticker"}
                        onClick={() => toggleFavorite(sticker)}
                      >
                        {sticker.isFavorite ? <StarFilled /> : <StarRegular />}
                      </button>
                      <button
                        type="button"
                        className="asset-tile-remove"
                        aria-label={`Remove ${sticker.name}`}
                        title="Remove sticker"
                        onClick={() => removeSticker(sticker)}
                      >
                        <DismissRegular />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </Panel>
      </section>
      {dialog?.kind === "create" ? (
        <StickerPackSettingsModal
          title="New sticker pack"
          submitLabel="Create pack"
          initialValues={{ title: "", author: "", sourceUrl: "" }}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            const created = await createOrUpdate(values, null);
            setSelectedPackId(created.id);
          }}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <StickerPackSettingsModal
          title="Edit sticker pack"
          submitLabel="Save"
          initialValues={{
            title: dialog.pack.title,
            author: dialog.pack.author ?? "",
            sourceUrl: dialog.pack.sourceUrl ?? "",
          }}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            await createOrUpdate(values, dialog.pack.id);
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <StickerPackDeleteModal
          packTitle={dialog.pack.title}
          stickerCount={dialog.pack.stickerCount}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await apiClient.deleteStickerPack(dialog.pack.id);
            if (editablePackId === dialog.pack.id) {
              setSelectedPackId(null);
            }
            await refreshPacks();
            await loadStickers(null);
          }}
        />
      ) : null}
    </>
  );

  async function createOrUpdate(values: StickerPackSettings, packId: string | null) {
    const payload = {
      title: values.title,
      author: values.author.length === 0 ? null : values.author,
      sourceUrl: values.sourceUrl.length === 0 ? null : values.sourceUrl,
    };
    const result = packId
      ? await apiClient.updateStickerPack(packId, payload)
      : await apiClient.createStickerPack(payload);
    await refreshPacks();
    return result;
  }
}
