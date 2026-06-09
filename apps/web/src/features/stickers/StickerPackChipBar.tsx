import { Button } from "@fluentui/react-components";
import { StarRegular } from "@fluentui/react-icons";

import type { StickerPack } from "../../types";

export const FAVORITES_PACK_ID = "__favorites__" as const;
export type StickerPackSelection = string | typeof FAVORITES_PACK_ID | null;

export function StickerPackChipBar({
  packs,
  selectedPackId,
  onSelectPack,
  favoriteCount,
  trailing,
  className,
}: {
  packs: StickerPack[];
  selectedPackId: StickerPackSelection;
  onSelectPack: (packId: StickerPackSelection) => void;
  favoriteCount?: number;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const isFavoritesSelected = selectedPackId === FAVORITES_PACK_ID;
  const isAllSelected = selectedPackId === null;
  return (
    <div className={`album-chip-bar${className ? ` ${className}` : ""}`}>
      <div className="album-chip-bar-list" role="tablist" aria-label="Filter by sticker pack">
        <Button
          type="button"
          appearance={isAllSelected ? "primary" : "subtle"}
          className={`album-chip${isAllSelected ? " album-chip-selected" : ""}`}
          role="tab"
          aria-selected={isAllSelected}
          onClick={() => onSelectPack(null)}
        >
          <span className="album-chip-label">All stickers</span>
        </Button>
        <Button
          type="button"
          appearance={isFavoritesSelected ? "primary" : "subtle"}
          className={`album-chip${isFavoritesSelected ? " album-chip-selected" : ""}`}
          role="tab"
          aria-selected={isFavoritesSelected}
          icon={<StarRegular />}
          onClick={() => onSelectPack(FAVORITES_PACK_ID)}
        >
          <span className="album-chip-label">Favorites</span>
          {typeof favoriteCount === "number" ? (
            <span className="album-chip-count" aria-hidden="true">
              {favoriteCount}
            </span>
          ) : null}
        </Button>
        {packs.map((pack) => {
          const isSelected = pack.id === selectedPackId;
          return (
            <Button
              key={pack.id}
              type="button"
              appearance={isSelected ? "primary" : "subtle"}
              className={`album-chip${isSelected ? " album-chip-selected" : ""}`}
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectPack(pack.id)}
            >
              <span className="album-chip-label">{pack.title}</span>
              <span className="album-chip-count" aria-hidden="true">
                {pack.stickerCount}
              </span>
            </Button>
          );
        })}
      </div>
      {trailing ? <div className="album-chip-bar-trailing">{trailing}</div> : null}
    </div>
  );
}
