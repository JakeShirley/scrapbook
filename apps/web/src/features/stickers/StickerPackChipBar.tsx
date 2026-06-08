import { Button } from "@fluentui/react-components";

import type { StickerPack } from "../../types";

export function StickerPackChipBar({
  packs,
  selectedPackId,
  onSelectPack,
  trailing,
  className,
}: {
  packs: StickerPack[];
  selectedPackId: string | null;
  onSelectPack: (packId: string | null) => void;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`album-chip-bar${className ? ` ${className}` : ""}`}>
      <div className="album-chip-bar-list" role="tablist" aria-label="Filter by sticker pack">
        <Button
          type="button"
          appearance={selectedPackId === null ? "primary" : "subtle"}
          className={`album-chip${selectedPackId === null ? " album-chip-selected" : ""}`}
          role="tab"
          aria-selected={selectedPackId === null}
          onClick={() => onSelectPack(null)}
        >
          <span className="album-chip-label">All stickers</span>
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
