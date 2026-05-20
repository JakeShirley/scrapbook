import { Button } from "@fluentui/react-components";
import { CopyRegular, DeleteRegular, DismissRegular } from "@fluentui/react-icons";

import type { PageDetail } from "../../types";

type PageSettingsPanelProps = {
  isWorking: boolean;
  page: PageDetail;
  pageId: string;
  pageIndex: number;
  onChangeBackground: (pageId: string, backgroundColor: string) => void;
  onChangeTitle: (pageId: string, title: string) => void;
  onClose: () => void;
  onDelete: (pageId: string) => void;
  onDuplicate: (pageId: string) => void;
};

export function PageSettingsPanel({
  isWorking,
  page,
  pageId,
  pageIndex,
  onChangeBackground,
  onChangeTitle,
  onClose,
  onDelete,
  onDuplicate,
}: PageSettingsPanelProps) {
  return (
    <form
      className="page-card-editor"
      aria-label={`Edit page ${pageIndex + 1}`}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="page-card-editor-heading">
        <span>{`Page ${pageIndex + 1} settings`}</span>
        <button type="button" aria-label="Close page settings" title="Close" onClick={onClose}>
          <DismissRegular />
        </button>
      </div>
      <label>
        <span>Title</span>
        <input
          maxLength={120}
          value={page.title}
          onChange={(event) => onChangeTitle(pageId, event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Background</span>
        <input
          type="color"
          value={page.document.canvas.backgroundColor}
          onChange={(event) => onChangeBackground(pageId, event.currentTarget.value)}
        />
      </label>
      <div className="page-card-editor-actions">
        <Button
          type="button"
          className="secondary-button"
          disabled={isWorking}
          icon={<CopyRegular />}
          onClick={() => onDuplicate(pageId)}
        >
          Duplicate
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={isWorking}
          icon={<DeleteRegular />}
          onClick={() => onDelete(pageId)}
        >
          Delete
        </Button>
      </div>
    </form>
  );
}
