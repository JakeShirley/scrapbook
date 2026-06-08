import { Button } from "@fluentui/react-components";
import { useState } from "react";

import { AppModal } from "../../components/layout";

export function StickerPackDeleteModal({
  packTitle,
  stickerCount,
  onClose,
  onConfirm,
}: {
  packTitle: string;
  stickerCount: number;
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
      setError(
        submitError instanceof Error ? submitError.message : "Could not delete sticker pack",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <AppModal
      title="Delete sticker pack"
      size="compact"
      closeDisabled={isSubmitting}
      onClose={onClose}
    >
      <div className="album-delete-modal">
        <p>
          Delete the pack <strong>{packTitle}</strong>?{" "}
          {stickerCount > 0
            ? `Its ${stickerCount} sticker${stickerCount === 1 ? "" : "s"} will be removed too. Stickers already placed on pages will keep their last image until those layers are replaced.`
            : "This pack does not contain any stickers."}
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
            Delete pack
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
