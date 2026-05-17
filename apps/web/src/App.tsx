const libraryItems = ["Family prints", "May weekend", "Garden"];
const pageItems = ["Cover", "Page 01", "Page 02"];
const activityItems = ["Draft saved", "3 assets queued", "API offline"];

export function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>
          <div>
            <h1>Scrapbook</h1>
            <p>0.0.0-development</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Workspace sections">
          <a href="/" aria-current="page">
            Library
          </a>
          <a href="/pages">Pages</a>
          <a href="/books">Books</a>
          <a href="/exports">Exports</a>
        </nav>
      </aside>

      <section className="workspace" aria-label="Scrapbook workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local workspace</p>
            <h2>Library</h2>
          </div>
          <div className="topbar-actions">
            <button type="button" className="secondary-button">
              Upload
            </button>
            <button type="button" className="primary-button">
              New page
            </button>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="asset-panel" aria-labelledby="asset-heading">
            <div className="panel-heading">
              <h3 id="asset-heading">Assets</h3>
              <span>3</span>
            </div>
            <div className="asset-grid">
              {libraryItems.map((item, index) => (
                <button className="asset-tile" type="button" key={item}>
                  <span className={`asset-swatch swatch-${index + 1}`} aria-hidden="true" />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="canvas-panel" aria-labelledby="canvas-heading">
            <div className="panel-heading">
              <h3 id="canvas-heading">Page draft</h3>
              <span>8.5 x 11</span>
            </div>
            <div className="canvas-surface" role="img" aria-label="Page preview">
              <div className="photo-slot large-slot" />
              <div className="photo-slot small-slot" />
              <div className="text-strip" />
            </div>
          </section>

          <section className="detail-panel" aria-labelledby="detail-heading">
            <div className="panel-heading">
              <h3 id="detail-heading">Pages</h3>
              <span>3</span>
            </div>
            <ol className="page-list">
              {pageItems.map((item) => (
                <li key={item}>
                  <button type="button">{item}</button>
                </li>
              ))}
            </ol>
          </section>

          <section className="activity-panel" aria-labelledby="activity-heading">
            <div className="panel-heading">
              <h3 id="activity-heading">Activity</h3>
            </div>
            <ul className="activity-list">
              {activityItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
