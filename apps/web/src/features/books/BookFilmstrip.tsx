import { Button } from "@fluentui/react-components";
import {
  AddRegular,
  CheckmarkRegular,
  EditRegular,
  EyeRegular,
  ReOrderDotsVerticalRegular,
} from "@fluentui/react-icons";
import type { DragEvent, MouseEvent } from "react";

import type { PageDetail } from "../../types";
import type { PageDropTarget, PageSelectionMode } from "./bookEditorTypes";

type BookFilmstripProps = {
  draggedPageIds: string[];
  editingPageId: string | null;
  isWorking: boolean;
  markedPageIds: string[];
  orderedPageIds: string[];
  pageDetails: Map<string, PageDetail>;
  pageDropTarget: PageDropTarget | null;
  visiblePageIds: string[];
  onAddPage: () => void;
  onClearDragState: () => void;
  onClearSelection: () => void;
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
  draggedPageIds,
  editingPageId,
  isWorking,
  markedPageIds,
  orderedPageIds,
  pageDetails,
  pageDropTarget,
  visiblePageIds,
  onAddPage,
  onClearDragState,
  onClearSelection,
  onDragOver,
  onDragStart,
  onDrop,
  onSelectPage,
  onTogglePageSettings,
}: BookFilmstripProps) {
  const markedPageIdSet = new Set(markedPageIds);
  const visiblePageIdSet = new Set(visiblePageIds);
  const draggedPageIdSet = new Set(draggedPageIds);
  const hasMultiSelection = markedPageIds.length > 1;
  const isDraggingSelection = draggedPageIds.length > 1;

  return (
    <div className="book-filmstrip-region">
      <div
        className="book-filmstrip-selection-bar"
        data-active={hasMultiSelection}
        role="status"
        aria-live="polite"
      >
        {hasMultiSelection ? (
          <>
            <span className="book-filmstrip-selection-count">
              <CheckmarkRegular />
              {markedPageIds.length} pages selected
            </span>
            <span className="book-filmstrip-selection-hint">
              Drag any selected page to move them together
            </span>
            <Button
              type="button"
              appearance="subtle"
              size="small"
              className="book-filmstrip-selection-clear"
              onClick={onClearSelection}
            >
              Clear selection
            </Button>
          </>
        ) : null}
      </div>
      <ol className="book-filmstrip" aria-label="Book pages" data-dragging={isDraggingSelection}>
        {orderedPageIds.map((pageId, index) => {
          const page = pageDetails.get(pageId);
          const isMarked = markedPageIdSet.has(pageId);
          const isVisible = visiblePageIdSet.has(pageId);
          const isDragged = draggedPageIdSet.has(pageId);
          const stateLabels = [isMarked ? "selected" : null, isVisible ? "on canvas" : null].filter(
            (label): label is string => label !== null,
          );

          return (
            <li
              key={pageId}
              data-dragging={isDragged}
              data-drop-position={
                pageDropTarget?.pageId === pageId ? pageDropTarget.position : undefined
              }
              data-editing={editingPageId === pageId}
              data-marked={isMarked}
              data-visible={isVisible}
              draggable={!isWorking}
              onDragEnd={onClearDragState}
              onDragOver={(event) => onDragOver(event, pageId)}
              onDragStart={(event) => onDragStart(event, pageId)}
              onDrop={(event) => onDrop(event, pageId)}
            >
              <button
                type="button"
                className="book-filmstrip-select"
                aria-current={isVisible ? "page" : undefined}
                aria-pressed={isMarked}
                title={selectionHint}
                onClick={(event) => onSelectPage(pageId, getSelectionMode(event))}
              >
                <span className="book-filmstrip-badges">
                  <span className="book-filmstrip-index">{index + 1}</span>
                  {isMarked ? (
                    <span className="book-filmstrip-check" aria-hidden="true">
                      <CheckmarkRegular />
                    </span>
                  ) : null}
                  {isVisible ? (
                    <span className="book-filmstrip-viewing" aria-hidden="true" title="On canvas">
                      <EyeRegular />
                    </span>
                  ) : null}
                </span>
                <span className="book-filmstrip-title">{page?.title ?? "Page"}</span>
                {stateLabels.length > 0 ? (
                  <span className="visually-hidden">{`, ${stateLabels.join(" and ")}`}</span>
                ) : null}
              </button>
              {isDragged && isDraggingSelection ? (
                <span className="book-filmstrip-drag-count" aria-hidden="true">
                  {draggedPageIds.length}
                </span>
              ) : null}
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
    </div>
  );
}
