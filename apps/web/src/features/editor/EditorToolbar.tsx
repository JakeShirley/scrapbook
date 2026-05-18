import { Button, Field, Input } from "@fluentui/react-components";
import { TextTRegular } from "@fluentui/react-icons";
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
      <Field label="Title">
        <Input
          value={title}
          maxLength={120}
          onChange={(event) => onChangeTitle(event.currentTarget.value)}
        />
      </Field>
      <Field label="Background">
        <input
          type="color"
          value={document.canvas.backgroundColor}
          onChange={(event) => onChangeBackground(event.currentTarget.value)}
        />
      </Field>
      <Button
        type="button"
        className="secondary-button"
        icon={<TextTRegular />}
        onClick={onAddText}
      >
        Text
      </Button>
      <span className={`save-badge ${status}`}>{status}</span>
    </fieldset>
  );
}
