import { Button } from "@fluentui/react-components";
import { useState } from "react";

import { AppModal } from "../../components/layout";

export function AlbumDeleteModal({
  albumTitle,
  onClose,
  onConfirm,
}: {
  albumTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete album");
      setIsSubmitting(false);
    }
  };

  return (
    <AppModal title={`Delete album`} size="compact" closeDisabled={isSubmitting} onClose={onClose}>
      <div className="album-delete-modal">
        <p>
          Delete the album <strong>{albumTitle}</strong>? Photos in this album are not deleted.
        </p>
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
            type="button"
            className="primary-button"
            disabled={isSubmitting}
            onClick={confirm}
          >
            Delete album
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
