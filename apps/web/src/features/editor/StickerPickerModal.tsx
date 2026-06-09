import { Button, Field, Input } from "@fluentui/react-components";
import { AddRegular, StarFilled, StarRegular } from "@fluentui/react-icons";
import type { StickerDefinition, StickerId } from "@zakka/editor-core";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiClient } from "../../apiClient";
import { AppModal } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import { getStickerUsage, recordStickerUsage, subscribeStickerUsage } from "../../lib/stickerUsage";
import type { CustomSticker, StickerPack } from "../../types";

type StickerLibraryModule = typeof import("@zakka/editor-core/stickers");

const pageSize = 120;

type StickerSource = "builtin" | "custom" | "favorites";

type SortMode = "used" | "added" | "name";

const sortModeLabels: Record<SortMode, string> = {
  used: "Recently used",
  added: "Date added (newest)",
  name: "Name (A\u2013Z)",
};

const sortCustomStickers = (
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

const formatCategory = (sticker: StickerDefinition) =>
  `${sticker.libraryName} / ${sticker.category}`;

const stickerPreviewSrc = (stickerLibrary: StickerLibraryModule, sticker: StickerDefinition) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    stickerLibrary.renderStickerAssetSvg(sticker.id),
  )}`;

const customStickerToDefinition = (
  sticker: CustomSticker,
  packTitle: string,
): StickerDefinition => ({
  category: "Custom",
  icon: sticker.id,
  id: `custom:${sticker.id}` as StickerId,
  library: "custom",
  libraryName: packTitle,
  name: sticker.name,
});

export function StickerPickerModal({
  onAddSticker,
  onClose,
}: {
  onAddSticker: (sticker: StickerDefinition) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<StickerSource>("custom");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("used");
  const [stickerUsage, setStickerUsage] = useState<Record<string, number>>(() => getStickerUsage());
  const [stickerLibrary, setStickerLibrary] = useState<StickerLibraryModule | null>(null);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase();

  const builtInResults = useMemo(
    () =>
      stickerLibrary?.searchStickers({ limit: visibleCount, query: normalizedQuery }) ?? {
        stickers: [],
        total: 0,
      },
    [normalizedQuery, stickerLibrary, visibleCount],
  );
  const visibleBuiltInStickers = builtInResults.stickers;
  const hasMoreBuiltInStickers = visibleBuiltInStickers.length < builtInResults.total;

  const packTitleById = useMemo(
    () => new Map(stickerPacks.map((pack) => [pack.id, pack.title])),
    [stickerPacks],
  );

  const filteredCustomStickers = useMemo(() => {
    const base =
      source === "favorites"
        ? customStickers.filter((sticker) => sticker.isFavorite)
        : selectedPackId === null
          ? customStickers
          : customStickers.filter((sticker) => sticker.packId === selectedPackId);

    const matched = !normalizedQuery
      ? base
      : base.filter((sticker) =>
          `${sticker.name} ${packTitleById.get(sticker.packId) ?? ""}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        );

    return sortCustomStickers(matched, sortMode, stickerUsage);
  }, [
    customStickers,
    normalizedQuery,
    packTitleById,
    selectedPackId,
    sortMode,
    source,
    stickerUsage,
  ]);

  const favoriteCount = useMemo(
    () => customStickers.reduce((total, sticker) => total + (sticker.isFavorite ? 1 : 0), 0),
    [customStickers],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset built-in page count whenever the search query or source changes
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [normalizedQuery, source]);

  useEffect(() => subscribeStickerUsage(setStickerUsage), []);

  useEffect(() => {
    let isCancelled = false;

    import("@zakka/editor-core/stickers").then((loadedStickerLibrary) => {
      if (!isCancelled) {
        setStickerLibrary(loadedStickerLibrary);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reattach the observer after each page loads so the sentinel keeps firing while it stays in view
  useEffect(() => {
    if (source !== "builtin") {
      return;
    }

    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMoreBuiltInStickers) {
      return;
    }

    const scrollRoot = sentinel.closest(".app-modal-body");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => current + pageSize);
        }
      },
      { root: scrollRoot ?? null, rootMargin: "400px 0px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMoreBuiltInStickers, visibleBuiltInStickers.length, source]);

  useEffect(() => {
    if (source !== "custom" && source !== "favorites") {
      return;
    }

    let isCancelled = false;
    setCustomLoading(true);
    setCustomError(null);

    Promise.all([apiClient.listStickerPacks(), apiClient.listCustomStickers()])
      .then(([packResponse, stickerResponse]) => {
        if (isCancelled) return;
        setStickerPacks(packResponse.packs);
        setCustomStickers(stickerResponse.stickers);
      })
      .catch((error: unknown) => {
        if (!isCancelled) setCustomError(getErrorMessage(error));
      })
      .finally(() => {
        if (!isCancelled) setCustomLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [source]);

  const addBuiltInSticker = (sticker: StickerDefinition) => {
    recordStickerUsage(sticker.id);
    onAddSticker(sticker);
    onClose();
  };

  const addCustomSticker = (sticker: CustomSticker) => {
    const packTitle = packTitleById.get(sticker.packId) ?? "Custom";
    const definition = customStickerToDefinition(sticker, packTitle);
    recordStickerUsage(definition.id);
    onAddSticker(definition);
    onClose();
  };

  const toggleCustomStickerFavorite = async (sticker: CustomSticker) => {
    const nextValue = !sticker.isFavorite;
    setCustomStickers((current) =>
      current.map((candidate) =>
        candidate.id === sticker.id ? { ...candidate, isFavorite: nextValue } : candidate,
      ),
    );
    try {
      const updated = await apiClient.setCustomStickerFavorite(sticker.id, {
        isFavorite: nextValue,
      });
      setCustomStickers((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
    } catch (favoriteError) {
      setCustomStickers((current) =>
        current.map((candidate) =>
          candidate.id === sticker.id
            ? { ...candidate, isFavorite: sticker.isFavorite }
            : candidate,
        ),
      );
      setCustomError(getErrorMessage(favoriteError));
    }
  };

  return (
    <AppModal title="Add sticker" onClose={onClose}>
      <div className="photo-picker-modal">
        <div className="sticker-picker-source-tabs" role="tablist" aria-label="Sticker source">
          <Button
            type="button"
            appearance={source === "custom" ? "primary" : "subtle"}
            role="tab"
            aria-selected={source === "custom"}
            className={`sticker-picker-source-tab${source === "custom" ? " sticker-picker-source-tab-selected" : ""}`}
            onClick={() => setSource("custom")}
          >
            Stickers
          </Button>
          <Button
            type="button"
            appearance={source === "favorites" ? "primary" : "subtle"}
            role="tab"
            aria-selected={source === "favorites"}
            icon={<StarRegular />}
            className={`sticker-picker-source-tab${source === "favorites" ? " sticker-picker-source-tab-selected" : ""}`}
            onClick={() => setSource("favorites")}
          >
            Favorites
            {favoriteCount > 0 ? (
              <span className="sticker-picker-source-tab-count" aria-hidden="true">
                {favoriteCount}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            appearance={source === "builtin" ? "primary" : "subtle"}
            role="tab"
            aria-selected={source === "builtin"}
            className={`sticker-picker-source-tab${source === "builtin" ? " sticker-picker-source-tab-selected" : ""}`}
            onClick={() => setSource("builtin")}
          >
            Emojis
          </Button>
        </div>
        <div className="photo-picker-toolbar">
          <Field label="Search stickers">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </Field>
          {source === "custom" && stickerPacks.length > 0 ? (
            <Field label="Pack">
              <select
                className="sticker-picker-pack-select"
                value={selectedPackId ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSelectedPackId(value.length === 0 ? null : value);
                }}
              >
                <option value="">All packs</option>
                {stickerPacks.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.title}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {source !== "builtin" ? (
            <label className="photo-picker-sort" htmlFor="sticker-picker-sort">
              <span>Sort by</span>
              <select
                id="sticker-picker-sort"
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
          ) : null}
          <span className="photo-picker-count">
            {source === "builtin"
              ? `${visibleBuiltInStickers.length} of ${builtInResults.total}`
              : `${filteredCustomStickers.length} sticker${filteredCustomStickers.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {source === "builtin" ? (
          <>
            {!stickerLibrary ? <p className="empty-state">Loading stickers</p> : null}
            {stickerLibrary && visibleBuiltInStickers.length === 0 ? (
              <p className="empty-state">No stickers match</p>
            ) : null}
            {stickerLibrary && visibleBuiltInStickers.length > 0 ? (
              <div className="photo-picker-grid sticker-picker-grid">
                {visibleBuiltInStickers.map((sticker) => (
                  <button
                    type="button"
                    key={sticker.id}
                    className="photo-picker-item sticker-picker-item"
                    aria-label={`Add ${sticker.name}`}
                    onClick={() => addBuiltInSticker(sticker)}
                  >
                    <img
                      src={stickerPreviewSrc(stickerLibrary, sticker)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
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
                {hasMoreBuiltInStickers ? (
                  <div ref={sentinelRef} className="sticker-picker-sentinel" aria-hidden="true" />
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            {customLoading ? <p className="empty-state">Loading custom stickers</p> : null}
            {customError ? (
              <p className="panel-alert" role="alert">
                {customError}
              </p>
            ) : null}
            {!customLoading && !customError && source === "custom" && stickerPacks.length === 0 ? (
              <p className="empty-state">
                You don't have any sticker packs yet. Create one from the Stickers page.
              </p>
            ) : null}
            {!customLoading &&
            !customError &&
            (source === "favorites" || stickerPacks.length > 0) &&
            filteredCustomStickers.length === 0 ? (
              <p className="empty-state">
                {source === "favorites"
                  ? "You haven't starred any stickers yet. Tap the star on a sticker to add it here."
                  : customStickers.length === 0
                    ? "No custom stickers uploaded yet."
                    : "No custom stickers match your filters."}
              </p>
            ) : null}
            {!customLoading && filteredCustomStickers.length > 0 ? (
              <div className="photo-picker-grid sticker-picker-grid">
                {filteredCustomStickers.map((sticker) => (
                  <div className="photo-picker-item-wrap" key={sticker.id}>
                    <button
                      type="button"
                      className="photo-picker-item sticker-picker-item"
                      aria-label={`Add ${sticker.name}`}
                      onClick={() => addCustomSticker(sticker)}
                    >
                      <img src={sticker.contentUrl} alt="" loading="lazy" decoding="async" />
                      <span className="photo-picker-item-copy">
                        <span>{sticker.name}</span>
                        <span>{packTitleById.get(sticker.packId) ?? "Custom"}</span>
                      </span>
                      <span className="primary-button photo-picker-add-indicator">
                        <AddRegular />
                        Add
                      </span>
                    </button>
                    <button
                      type="button"
                      className="asset-tile-favorite photo-picker-item-favorite"
                      aria-label={
                        sticker.isFavorite
                          ? `Remove ${sticker.name} from favorites`
                          : `Add ${sticker.name} to favorites`
                      }
                      aria-pressed={sticker.isFavorite}
                      title={sticker.isFavorite ? "Unfavorite sticker" : "Favorite sticker"}
                      onClick={() => toggleCustomStickerFavorite(sticker)}
                    >
                      {sticker.isFavorite ? <StarFilled /> : <StarRegular />}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppModal>
  );
}
