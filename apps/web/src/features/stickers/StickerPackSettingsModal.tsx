import { Button, Field, Input } from "@fluentui/react-components";
import { useState } from "react";

import { AppModal } from "../../components/layout";

export type StickerPackSettings = {
  title: string;
  author: string;
  sourceUrl: string;
};

export function StickerPackSettingsModal({
  title,
  submitLabel,
  initialValues,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initialValues: StickerPackSettings;
  onClose: () => void;
  onSubmit: (values: StickerPackSettings) => Promise<void> | void;
}) {
  const [packTitle, setPackTitle] = useState(initialValues.title);
  const [author, setAuthor] = useState(initialValues.author);
  const [sourceUrl, setSourceUrl] = useState(initialValues.sourceUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const trimmedTitle = packTitle.trim();

    if (trimmedTitle.length === 0) {
      setError("Pack name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        title: trimmedTitle,
        author: author.trim(),
        sourceUrl: sourceUrl.trim(),
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save sticker pack");
      setIsSubmitting(false);
    }
  };

  return (
    <AppModal title={title} size="compact" closeDisabled={isSubmitting} onClose={onClose}>
      <form
        className="album-name-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="Pack name" required>
          <Input
            type="text"
            value={packTitle}
            autoFocus
            maxLength={120}
            disabled={isSubmitting}
            onChange={(event) => setPackTitle(event.currentTarget.value)}
          />
        </Field>
        <Field label="Author">
          <Input
            type="text"
            value={author}
            maxLength={120}
            placeholder="Optional"
            disabled={isSubmitting}
            onChange={(event) => setAuthor(event.currentTarget.value)}
          />
        </Field>
        <Field label="Source URL">
          <Input
            type="url"
            value={sourceUrl}
            maxLength={2048}
            placeholder="https://example.com"
            disabled={isSubmitting}
            onChange={(event) => setSourceUrl(event.currentTarget.value)}
          />
        </Field>
        {error ? (
          <p className="panel-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="album-name-form-actions">
          <Button
            type="button"
            className="secondary-button"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            appearance="primary"
            type="submit"
            className="primary-button"
            disabled={isSubmitting || packTitle.trim().length === 0}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}
