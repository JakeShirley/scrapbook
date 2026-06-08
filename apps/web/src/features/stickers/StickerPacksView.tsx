import { Button } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowUploadRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import type { ChangeEvent, DragEvent as ReactDragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiClient } from "../../apiClient";
import { Panel, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import { formatBytes } from "../../lib/format";
import type { CustomSticker, StickerPack } from "../../types";
import { StickerPackChipBar } from "./StickerPackChipBar";
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
]);

const supportedStickerAccept =
  "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg";

export function StickerPacksView() {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [stickers, setStickers] = useState<CustomSticker[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStickersLoading, setIsStickersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dialog, setDialog] = useState<PackDialog | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPack = useMemo(
    () => (selectedPackId ? (packs.find((pack) => pack.id === selectedPackId) ?? null) : null),
    [packs, selectedPackId],
  );

  const refreshPacks = useCallback(async () => {
    const response = await apiClient.listStickerPacks();
    setPacks(response.packs);
    return response.packs;
  }, []);

  const loadStickers = useCallback(async (packId: string | null) => {
    setIsStickersLoading(true);
    try {
      const response = await apiClient.listCustomStickers(packId ?? undefined);
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

  const uploadStickers = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (!selectedPackId) {
      setError("Select a sticker pack before uploading.");
      return;
    }

    const packId = selectedPackId;

    setError(null);
    setUploadProgress(0);

    const uploaded: CustomSticker[] = [];
    const failures: string[] = [];

    for (const [fileIndex, file] of files.entries()) {
      try {
        const sticker = await apiClient.uploadCustomSticker(packId, file, {
          onProgress: (fileProgress) => {
            setUploadProgress((fileIndex + (fileProgress ?? 0)) / files.length);
          },
        });
        uploaded.push(sticker);
      } catch (uploadError: unknown) {
        failures.push(`${file.name}: ${getErrorMessage(uploadError)}`);
      } finally {
        setUploadProgress((fileIndex + 1) / files.length);
      }
    }

    if (uploaded.length > 0) {
      const uploadedIds = new Set(uploaded.map((sticker) => sticker.id));
      setStickers((current) => [...current.filter((s) => !uploadedIds.has(s.id)), ...uploaded]);
      await refreshPacks();
    }

    setError(failures.length > 0 ? failures.join(" ") : null);
    setUploadProgress(null);
  };

  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const dragOverDepthRef = useRef(0);
  const hasFilesPayload = (event: ReactDragEvent<HTMLDivElement>): boolean =>
    Array.from(event.dataTransfer.types).includes("Files");
  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !selectedPackId) return;
    dragOverDepthRef.current += 1;
    setIsFileDragOver(true);
  };
  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !selectedPackId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !selectedPackId) return;
    dragOverDepthRef.current = Math.max(0, dragOverDepthRef.current - 1);
    if (dragOverDepthRef.current === 0) setIsFileDragOver(false);
  };
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFilesPayload(event) || !selectedPackId) return;
    event.preventDefault();
    dragOverDepthRef.current = 0;
    setIsFileDragOver(false);
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      supportedStickerMimeTypes.has(file.type),
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

  const panelTitle = selectedPack ? selectedPack.title : "All stickers";
  const panelCount = selectedPack ? String(selectedPack.stickerCount) : String(stickers.length);

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
          disabled={uploadProgress !== null || !selectedPackId}
          icon={<ArrowUploadRegular />}
          onClick={() => fileInputRef.current?.click()}
          title={selectedPackId ? undefined : "Select a pack before uploading stickers"}
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
          <StickerPackChipBar
            packs={packs}
            selectedPackId={selectedPackId}
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
          {!isLoading && packs.length > 0 && !isStickersLoading && stickers.length === 0 ? (
            <p className="empty-state">
              {selectedPack
                ? "This pack is empty. Use Upload or drag images here to add stickers."
                : "No stickers in any pack yet."}
            </p>
          ) : null}
          {!isLoading && stickers.length > 0 ? (
            <div className="asset-grid sticker-pack-grid">
              {stickers.map((sticker) => {
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
            if (selectedPackId === dialog.pack.id) {
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
