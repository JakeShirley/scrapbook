import { Button } from "@fluentui/react-components";
import { AddRegular, EditRegular, ReOrderDotsVerticalRegular } from "@fluentui/react-icons";
import type { DragEvent } from "react";

import type { PageDetail } from "../../types";
import type { PageDropTarget } from "./bookEditorTypes";

type BookFilmstripProps = {
  activePageId: string;
  draggedPageId: string | null;
  editingPageId: string | null;
  isWorking: boolean;
  orderedPageIds: string[];
  pageDetails: Map<string, PageDetail>;
  pageDropTarget: PageDropTarget | null;
  selectedPageIds: string[];
  onAddPage: () => void;
  onClearDragState: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>, pageId: string) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>, pageId: string) => void;
  onDrop: (event: DragEvent<HTMLLIElement>, pageId: string) => void;
  onSelectPage: (pageId: string) => void;
  onTogglePageSettings: (pageId: string) => void;
};

export function BookFilmstrip({
  activePageId,
  draggedPageId,
  editingPageId,
  isWorking,
  orderedPageIds,
  pageDetails,
  pageDropTarget,
  selectedPageIds,
  onAddPage,
  onClearDragState,
  onDragOver,
  onDragStart,
  onDrop,
  onSelectPage,
  onTogglePageSettings,
}: BookFilmstripProps) {
  const selectedPageIdSet = new Set(selectedPageIds.length > 0 ? selectedPageIds : [activePageId]);

  return (
    <ol className="book-filmstrip" aria-label="Book pages">
      {orderedPageIds.map((pageId, index) => {
        const page = pageDetails.get(pageId);

        return (
          <li
            key={pageId}
            data-dragging={draggedPageId === pageId}
            data-drop-position={
              pageDropTarget?.pageId === pageId ? pageDropTarget.position : undefined
            }
            data-editing={editingPageId === pageId}
            draggable={!isWorking}
            onDragEnd={onClearDragState}
            onDragOver={(event) => onDragOver(event, pageId)}
            onDragStart={(event) => onDragStart(event, pageId)}
            onDrop={(event) => onDrop(event, pageId)}
          >
            <button
              type="button"
              className="book-filmstrip-select"
              aria-current={selectedPageIdSet.has(pageId) ? "page" : undefined}
              onClick={() => onSelectPage(pageId)}
            >
              <span className="book-filmstrip-index">{index + 1}</span>
              <span className="book-filmstrip-title">{page?.title ?? "Page"}</span>
            </button>
            <span className="book-filmstrip-drag-handle" aria-hidden="true">
              <ReOrderDotsVerticalRegular />
            </span>
            {page ? (
              <button
                type="button"
                className="book-filmstrip-edit"
                aria-label={`Edit page ${index + 1}`}
                title="Edit page"
                onClick={() => onTogglePageSettings(pageId)}
              >
                <EditRegular />
              </button>
            ) : null}
          </li>
        );
      })}
      <li className="book-filmstrip-add">
        <Button
          type="button"
          className="secondary-button book-filmstrip-add-button"
          disabled={isWorking}
          icon={<AddRegular />}
          onClick={onAddPage}
        >
          Add page
        </Button>
      </li>
    </ol>
  );
}
