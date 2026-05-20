import { Button, Field, Input } from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular } from "@fluentui/react-icons";
import type { FormEvent } from "react";
import { useState } from "react";

import { AppModal } from "../../components/layout";

const minDpi = 72;
const maxDpi = 600;

export function PngExportSettingsModal({
  closeDisabled = false,
  eyebrow,
  onClose,
  onSubmit,
}: {
  closeDisabled?: boolean;
  eyebrow?: string;
  onClose: () => void;
  onSubmit: (dpi: number) => void;
}) {
  const [dpiDraft, setDpiDraft] = useState("300");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const submitExport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const dpi = Number(dpiDraft);

    if (!Number.isInteger(dpi) || dpi < minDpi || dpi > maxDpi) {
      setValidationMessage(`Enter a whole number from ${minDpi} to ${maxDpi}.`);
      return;
    }

    setValidationMessage(null);
    onSubmit(dpi);
  };

  return (
    <AppModal
      title="PNG export settings"
      {...(eyebrow === undefined ? {} : { eyebrow })}
      size="compact"
      closeDisabled={closeDisabled}
      onClose={onClose}
    >
      <form className="export-settings-form" onSubmit={submitExport}>
        <Field
          label="DPI"
          {...(validationMessage
            ? { validationMessage, validationState: "error" as const }
            : { validationState: "none" as const })}
        >
          <Input
            inputMode="numeric"
            min={minDpi}
            max={maxDpi}
            step={1}
            type="number"
            value={dpiDraft}
            onChange={(event) => setDpiDraft(event.currentTarget.value)}
          />
        </Field>
        <div className="export-settings-actions">
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
            appearance="primary"
            className="primary-button"
            disabled={closeDisabled}
            icon={<CheckmarkRegular />}
          >
            Export
          </Button>
        </div>
      </form>
    </AppModal>
  );
}
