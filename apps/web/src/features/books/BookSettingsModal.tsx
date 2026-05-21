import { Button, Field, Input } from "@fluentui/react-components";
import { DismissRegular, RenameRegular } from "@fluentui/react-icons";
import type { FormEvent } from "react";

import { AppModal } from "../../components/layout";
import type { BookDetail } from "../../types";
import {
  commonBookPageSizes,
  customBookPageSizeKey,
  formatBookPageSize,
  getBookPageSizeKey,
} from "./pageSizes";

type BookSettingsModalProps = {
  book: BookDetail;
  closeDisabled: boolean;
  coverSpreadEnabledDraft: boolean;
  pageSizeDraft: string;
  titleDraft: string;
  onClose: () => void;
  onCoverSpreadEnabledDraftChange: (enabled: boolean) => void;
  onPageSizeDraftChange: (pageSizeKey: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleDraftChange: (title: string) => void;
};

export function BookSettingsModal({
  book,
  closeDisabled,
  coverSpreadEnabledDraft,
  pageSizeDraft,
  titleDraft,
  onClose,
  onCoverSpreadEnabledDraftChange,
  onPageSizeDraftChange,
  onSubmit,
  onTitleDraftChange,
}: BookSettingsModalProps) {
  return (
    <AppModal
      title="Book settings"
      eyebrow={book.title}
      size="compact"
      closeDisabled={closeDisabled}
      onClose={onClose}
    >
      <form className="book-settings-form" onSubmit={onSubmit}>
        <Field label="Book title">
          <Input
            maxLength={120}
            value={titleDraft}
            onChange={(event) => onTitleDraftChange(event.currentTarget.value)}
          />
        </Field>
        <Field label="Page size">
          <select
            className="book-size-select"
            value={pageSizeDraft}
            onChange={(event) => onPageSizeDraftChange(event.currentTarget.value)}
          >
            {getBookPageSizeKey(book) === customBookPageSizeKey ? (
              <option value={customBookPageSizeKey}>{formatBookPageSize(book)}</option>
            ) : null}
            {commonBookPageSizes.map((pageSize) => (
              <option key={pageSize.key} value={pageSize.key}>
                {pageSize.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={coverSpreadEnabledDraft}
            onChange={(event) => onCoverSpreadEnabledDraftChange(event.currentTarget.checked)}
          />
          <span>Keep front and back covers together</span>
        </label>
        <div className="book-settings-actions">
          <Button
            type="button"
            className="secondary-button"
            disabled={closeDisabled}
            icon={<DismissRegular />}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="secondary-button"
            disabled={closeDisabled}
            icon={<RenameRegular />}
          >
            Save
          </Button>
        </div>
      </form>
    </AppModal>
  );
}
