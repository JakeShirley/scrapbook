import type { PageDocument } from "@scrapbook/editor-core";

import type { EditorSaveStatus } from "./editorTypes";

export function EditorToolbar({
  document,
  status,
  title,
  onAddText,
  onChangeBackground,
  onChangeTitle,
}: {
  document: PageDocument;
  status: EditorSaveStatus;
  title: string;
  onAddText: () => void;
  onChangeBackground: (backgroundColor: string) => void;
  onChangeTitle: (title: string) => void;
}) {
  return (
    <fieldset className="editor-toolbar">
      <legend className="visually-hidden">Editor tools</legend>
      <label>
        <span>Title</span>
        <input
          value={title}
          maxLength={120}
          onChange={(event) => onChangeTitle(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Background</span>
        <input
          type="color"
          value={document.canvas.backgroundColor}
          onChange={(event) => onChangeBackground(event.currentTarget.value)}
        />
      </label>
      <button type="button" className="secondary-button" onClick={onAddText}>
        T
      </button>
      <span className={`save-badge ${status}`}>{status}</span>
    </fieldset>
  );
}
