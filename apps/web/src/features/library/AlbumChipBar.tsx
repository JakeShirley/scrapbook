import { Button } from "@fluentui/react-components";

import type { Album } from "../../types";

export function AlbumChipBar({
  albums,
  selectedAlbumId,
  onSelectAlbum,
  trailing,
  className,
}: {
  albums: Album[];
  selectedAlbumId: string | null;
  onSelectAlbum: (albumId: string | null) => void;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`album-chip-bar${className ? ` ${className}` : ""}`}>
      <div className="album-chip-bar-list" role="tablist" aria-label="Filter by album">
        <Button
          type="button"
          appearance={selectedAlbumId === null ? "primary" : "subtle"}
          className={`album-chip${selectedAlbumId === null ? " album-chip-selected" : ""}`}
          role="tab"
          aria-selected={selectedAlbumId === null}
          onClick={() => onSelectAlbum(null)}
        >
          <span className="album-chip-label">All photos</span>
        </Button>
        {albums.map((album) => {
          const isSelected = album.id === selectedAlbumId;
          return (
            <Button
              key={album.id}
              type="button"
              appearance={isSelected ? "primary" : "subtle"}
              className={`album-chip${isSelected ? " album-chip-selected" : ""}`}
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectAlbum(album.id)}
            >
              <span className="album-chip-label">{album.title}</span>
              <span className="album-chip-count" aria-hidden="true">
                {album.photoCount}
              </span>
            </Button>
          );
        })}
      </div>
      {trailing ? <div className="album-chip-bar-trailing">{trailing}</div> : null}
    </div>
  );
}
