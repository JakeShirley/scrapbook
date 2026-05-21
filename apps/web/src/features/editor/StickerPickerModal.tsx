import { Field, Input } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import type { StickerDefinition } from "@scrapbook/editor-core";
import { useEffect, useMemo, useState } from "react";

import { AppModal } from "../../components/layout";

type StickerLibraryModule = typeof import("@scrapbook/editor-core/stickers");

const resultLimit = 160;

const formatCategory = (sticker: StickerDefinition) =>
  `${sticker.libraryName} / ${sticker.category}`;

const stickerPreviewSrc = (stickerLibrary: StickerLibraryModule, sticker: StickerDefinition) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    stickerLibrary.renderStickerAssetSvg(sticker.id),
  )}`;

export function StickerPickerModal({
  eyebrow,
  onAddSticker,
  onClose,
}: {
  eyebrow?: string;
  onAddSticker: (sticker: StickerDefinition) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [stickerLibrary, setStickerLibrary] = useState<StickerLibraryModule | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const stickerResults = useMemo(
    () =>
      stickerLibrary?.searchStickers({ limit: resultLimit, query: normalizedQuery }) ?? {
        stickers: [],
        total: 0,
      },
    [normalizedQuery, stickerLibrary],
  );
  const visibleStickers = stickerResults.stickers;

  useEffect(() => {
    let isCancelled = false;

    import("@scrapbook/editor-core/stickers").then((loadedStickerLibrary) => {
      if (!isCancelled) {
        setStickerLibrary(loadedStickerLibrary);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  const addSticker = (sticker: StickerDefinition) => {
    onAddSticker(sticker);
    onClose();
  };

  return (
    <AppModal title="Add sticker" {...(eyebrow === undefined ? {} : { eyebrow })} onClose={onClose}>
      <div className="photo-picker-modal">
        <div className="photo-picker-toolbar">
          <Field label="Search stickers">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </Field>
          <span className="photo-picker-count">
            {visibleStickers.length} of {stickerResults.total}
          </span>
        </div>
        {!stickerLibrary ? <p className="empty-state">Loading stickers</p> : null}
        {stickerLibrary && visibleStickers.length === 0 ? (
          <p className="empty-state">No stickers match</p>
        ) : null}
        {stickerLibrary && visibleStickers.length > 0 ? (
          <div className="photo-picker-grid sticker-picker-grid">
            {visibleStickers.map((sticker) => (
              <button
                type="button"
                key={sticker.id}
                className="photo-picker-item sticker-picker-item"
                aria-label={`Add ${sticker.name}`}
                onClick={() => addSticker(sticker)}
              >
                <img src={stickerPreviewSrc(stickerLibrary, sticker)} alt="" />
                <span className="photo-picker-item-copy">
                  <span>{sticker.name}</span>
                  <span>{formatCategory(sticker)}</span>
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
