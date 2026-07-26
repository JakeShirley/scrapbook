import { Button } from "@fluentui/react-components";
import { AddRegular, EditRegular, ReOrderDotsVerticalRegular } from "@fluentui/react-icons";
import type { DragEvent, MouseEvent } from "react";

import type { PageDropTarget, PageSelectionMode } from "./bookEditorTypes";
import type { PageDetail } from "../../types";

type BookFilmstripProps = {
  activePageId: string;
  draggedPageIds: string[];
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
  onSelectPage: (pageId: string, mode: PageSelectionMode) => void;
  onTogglePageSettings: (pageId: string) => void;
};

const selectionHint =
  "Ctrl or Cmd click to select more pages, Shift click to select a range, then drag to move them together.";

const getSelectionMode = (event: MouseEvent<HTMLButtonElement>): PageSelectionMode => {
  if (event.shiftKey) {
    return "range";
  }

  return event.ctrlKey || event.metaKey ? "toggle" : "replace";
};

export function BookFilmstrip({
  activePageId,
  draggedPageIds,
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
  const draggedPageIdSet = new Set(draggedPageIds);

  return (
    <ol className="book-filmstrip" aria-label="Book pages">
      {orderedPageIds.map((pageId, index) => {
        const page = pageDetails.get(pageId);
        const isSelected = selectedPageIdSet.has(pageId);

        return (
          <li
            key={pageId}
            data-dragging={draggedPageIdSet.has(pageId)}
            data-drop-position={
              pageDropTarget?.pageId === pageId ? pageDropTarget.position : undefined
            }
            data-editing={editingPageId === pageId}
            data-selected={isSelected}
            draggable={!isWorking}
            onDragEnd={onClearDragState}
            onDragOver={(event) => onDragOver(event, pageId)}
            onDragStart={(event) => onDragStart(event, pageId)}
            onDrop={(event) => onDrop(event, pageId)}
          >
            <button
              type="button"
              className="book-filmstrip-select"
              aria-current={isSelected ? "page" : undefined}
              title={selectionHint}
              onClick={(event) => onSelectPage(pageId, getSelectionMode(event))}
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
