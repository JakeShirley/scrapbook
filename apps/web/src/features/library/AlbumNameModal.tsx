import { Button, Field, Input } from "@fluentui/react-components";
import { useState } from "react";

import { AppModal } from "../../components/layout";

export function AlbumNameModal({
  title,
  initialName,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initialName: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Album name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save album");
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
        <Field label="Album name" required>
          <Input
            type="text"
            value={name}
            autoFocus
            maxLength={120}
            disabled={isSubmitting}
            onChange={(event) => setName(event.currentTarget.value)}
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
            disabled={isSubmitting || name.trim().length === 0}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}
