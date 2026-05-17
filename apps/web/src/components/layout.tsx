import type { ReactNode } from "react";

export function LoadingScreen() {
  return (
    <main className="loading-screen" aria-busy="true">
      <div className="brand-mark" aria-hidden="true">
        S
      </div>
      <p>Opening Scrapbook</p>
    </main>
  );
}

export function WorkspaceHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Local workspace</p>
        <h2>{title}</h2>
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
  return (
    <section className="panel" aria-labelledby={`${title.toLowerCase()}-heading`}>
      <div className="panel-heading">
        <h3 id={`${title.toLowerCase()}-heading`}>{title}</h3>
        {count ? <span>{count}</span> : null}
      </div>
      {children}
    </section>
  );
}
