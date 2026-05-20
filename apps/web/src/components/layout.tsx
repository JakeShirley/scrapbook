import { Badge, Spinner } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { useEffect, useId } from "react";

export function LoadingScreen() {
  return (
    <main className="loading-screen" aria-busy="true">
      <div className="brand-mark" aria-hidden="true">
        S
      </div>
      <Spinner size="small" />
      <p>Opening Scrapbook</p>
    </main>
  );
}

export function WorkspaceHeader({
  title,
  titleActions,
  children,
}: {
  title: string;
  titleActions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar-heading">
        <p className="eyebrow">Local workspace</p>
        <div className="topbar-title-row">
          <h2>{title}</h2>
          {titleActions ? <div className="topbar-title-actions">{titleActions}</div> : null}
        </div>
      </div>
      {children ? <div className="topbar-actions">{children}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <section className="panel" aria-labelledby={titleId}>
      <div className="panel-heading">
        <h3 id={titleId}>{title}</h3>
        {count ? <Badge appearance="tint">{count}</Badge> : null}
      </div>
      {children}
    </section>
  );
}

export function AppModal({
  title,
  eyebrow,
  children,
  closeDisabled = false,
  size = "wide",
  onClose,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  closeDisabled?: boolean;
  size?: "compact" | "wide";
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) {
        onClose();
      }
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closeDisabled, onClose]);

  const close = () => {
    if (!closeDisabled) {
      onClose();
    }
  };

  return (
    <div className="app-modal-overlay">
      <button
        type="button"
        className="app-modal-backdrop"
        disabled={closeDisabled}
        tabIndex={-1}
        aria-label="Close"
        onClick={close}
      />
      <section
        className="app-modal-dialog"
        data-size={size}
        role="dialog"
        aria-labelledby={titleId}
        aria-modal="true"
      >
        <header className="app-modal-header">
          <div className="app-modal-title">
            {eyebrow ? <span>{eyebrow}</span> : null}
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            disabled={closeDisabled}
            aria-label="Close"
            title="Close"
            onClick={close}
          >
            <DismissRegular />
          </button>
        </header>
        <div className="app-modal-body">{children}</div>
      </section>
    </div>
  );
}
