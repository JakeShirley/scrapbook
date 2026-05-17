import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router";
import {
  addLayer,
  createPageDocument,
  createPhotoLayer,
  createTextLayer,
  deleteLayer,
  duplicateLayer,
  reorderLayer,
  type PageDocument,
  type PageLayer,
  updateCanvas,
  updateLayer,
} from "@scrapbook/editor-core";

import { ApiClientError, apiClient } from "./apiClient";

type AuthSession = Awaited<ReturnType<typeof apiClient.getCurrentSession>>;
type Asset = Awaited<ReturnType<typeof apiClient.listAssets>>["assets"][number];
type PageSummary = Awaited<ReturnType<typeof apiClient.listPages>>["pages"][number];
type PageDetail = Awaited<ReturnType<typeof apiClient.getPage>>;

type SessionState =
  | { status: "loading" }
  | { status: "anonymous"; message?: string }
  | { status: "authenticated"; session: AuthSession };

type AuthMode = "login" | "register";

const navItems = [
  { to: "/library", label: "Library" },
  { to: "/pages", label: "Pages" },
  { to: "/books", label: "Books" },
  { to: "/settings", label: "Settings" },
];

const bookItems = ["Spring album", "Travel notes"];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong";
};

const formatBytes = (byteSize: number): string => {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDimensions = (asset: Asset): string => {
  if (!asset.width || !asset.height) {
    return "Unknown size";
  }

  return `${asset.width} x ${asset.height}`;
};

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    apiClient
      .getCurrentSession()
      .then((session) => {
        if (isMounted) {
          setSessionState({ status: "authenticated", session });
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setSessionState({ status: "anonymous" });
          return;
        }

        setSessionState({ status: "anonymous", message: getErrorMessage(error) });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const authenticate = async (mode: AuthMode, form: FormData) => {
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const session =
      mode === "login"
        ? await apiClient.login({ email, password })
        : await apiClient.register({
            displayName: String(form.get("displayName") ?? ""),
            email,
            password,
          });

    setSessionState({ status: "authenticated", session });
  };

  const logout = async () => {
    await apiClient.logout();
    setSessionState({ status: "anonymous" });
  };

  if (sessionState.status === "loading") {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          sessionState.status === "authenticated" ? (
            <Navigate to="/library" replace />
          ) : (
            <AuthPage initialMessage={sessionState.message} onAuthenticate={authenticate} />
          )
        }
      />
      <Route
        path="/*"
        element={
          sessionState.status === "authenticated" ? (
            <ProtectedShell session={sessionState.session} onLogout={logout} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
    </Routes>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-busy="true">
      <div className="brand-mark" aria-hidden="true">
        S
      </div>
      <p>Opening Scrapbook</p>
    </main>
  );
}

function AuthPage({
  initialMessage,
  onAuthenticate,
}: {
  initialMessage: string | undefined;
  onAuthenticate: (mode: AuthMode, form: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(initialMessage ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onAuthenticate(mode, new FormData(event.currentTarget));
      navigate("/library", { replace: true });
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="brand-block auth-brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>
          <div>
            <h1 id="auth-heading">Scrapbook</h1>
            <p>0.0.0-development</p>
          </div>
        </div>

        <div className="segmented-control" role="tablist" aria-label="Authentication mode">
          <button
            aria-selected={mode === "login"}
            role="tab"
            type="button"
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            aria-selected={mode === "register"}
            role="tab"
            type="button"
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>

        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              <span>Name</span>
              <input autoComplete="name" maxLength={120} name="displayName" required />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input autoComplete="email" maxLength={320} name="email" required type="email" />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={256}
              minLength={mode === "register" ? 12 : 1}
              name="password"
              required
              type="password"
            />
          </label>
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Working" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ProtectedShell({
  session,
  onLogout,
}: {
  session: AuthSession;
  onLogout: () => Promise<void>;
}) {
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const navigate = useNavigate();

  const logout = async () => {
    setLogoutError(null);

    try {
      await onLogout();
      navigate("/auth", { replace: true });
    } catch (error: unknown) {
      setLogoutError(getErrorMessage(error));
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>
          <div>
            <h1>Scrapbook</h1>
            <p>{session.account.displayName}</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Workspace sections">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>{session.account.primaryEmail}</p>
          <button className="secondary-button" type="button" onClick={logout}>
            Sign out
          </button>
          {logoutError ? (
            <p className="sidebar-alert" role="alert">
              {logoutError}
            </p>
          ) : null}
        </div>
      </aside>

      <section className="workspace" aria-label="Scrapbook workspace">
        <Routes>
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="library" element={<LibraryView />} />
          <Route path="pages" element={<PagesView />} />
          <Route path="pages/:pageId" element={<EditorView />} />
          <Route path="books" element={<BooksView />} />
          <Route path="settings" element={<SettingsView session={session} />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </section>
    </main>
  );
}

function WorkspaceHeader({ title, children }: { title: string; children?: ReactNode }) {
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

function Panel({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
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

function LibraryView() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    apiClient
      .listAssets()
      .then((response) => {
        if (isMounted) {
          setAssets(response.assets);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const uploadAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setUploadProgress(0);

    try {
      const asset = await apiClient.uploadAsset(file, setUploadProgress);
      setAssets((currentAssets) => [
        asset,
        ...currentAssets.filter((item) => item.id !== asset.id),
      ]);
    } catch (uploadError: unknown) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploadProgress(null);
    }
  };

  return (
    <>
      <WorkspaceHeader title="Library">
        <input
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          type="file"
          onChange={uploadAsset}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={uploadProgress !== null}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </button>
        <button type="button" className="primary-button" onClick={() => navigate("/pages")}>
          New page
        </button>
      </WorkspaceHeader>

      <div className="workspace-grid library-grid">
        <Panel title="Assets" count={String(assets.length)}>
          {error ? (
            <p className="panel-alert" role="alert">
              {error}
            </p>
          ) : null}
          {uploadProgress !== null ? (
            <div className="upload-progress" aria-live="polite">
              <span>Uploading</span>
              <progress value={uploadProgress ?? undefined} max={1} />
            </div>
          ) : null}
          {isLoading ? <p className="empty-state">Loading assets</p> : null}
          {!isLoading && assets.length === 0 ? <p className="empty-state">No assets yet</p> : null}
          {assets.length > 0 ? (
            <div className="asset-grid">
              {assets.map((asset) => (
                <button className="asset-tile" type="button" key={asset.id}>
                  <img src={asset.thumbnailUrl ?? asset.originalContentUrl} alt="" />
                  <span className="asset-tile-copy">
                    <span>{asset.originalFilename}</span>
                    <span>
                      {formatDimensions(asset)} / {formatBytes(asset.byteSize)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Pages">
          <p className="empty-state">Create and edit pages from the Pages workspace.</p>
        </Panel>
      </div>
    </>
  );
}

function PagesView() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    apiClient
      .listPages()
      .then((response) => {
        if (isMounted) {
          setPages(response.pages);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const createPage = async () => {
    setError(null);
    setIsCreating(true);

    try {
      const page = await apiClient.createPage({ document: createPageDocument() });
      navigate(`/pages/${page.id}`);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <WorkspaceHeader title="Pages">
        <button type="button" className="primary-button" disabled={isCreating} onClick={createPage}>
          New page
        </button>
      </WorkspaceHeader>
      <div className="workspace-grid split-grid">
        <Panel title="Pages" count={String(pages.length)}>
          {error ? (
            <p className="panel-alert" role="alert">
              {error}
            </p>
          ) : null}
          {isLoading ? <p className="empty-state">Loading pages</p> : null}
          {!isLoading && pages.length === 0 ? <p className="empty-state">No pages yet</p> : null}
          {pages.length > 0 ? <PageList pages={pages} /> : null}
        </Panel>
        <Panel title="Preview">
          <p className="empty-state">Select a page to open the editor.</p>
        </Panel>
      </div>
    </>
  );
}

function EditorView() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [document, setDocument] = useState<PageDocument | null>(null);
  const [title, setTitle] = useState("Untitled page");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "saved" | "unsaved" | "saving" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!pageId) {
      navigate("/pages", { replace: true });
      return () => {
        isMounted = false;
      };
    }

    Promise.all([apiClient.getPage(pageId), apiClient.listAssets()])
      .then(([loadedPage, assetResponse]) => {
        if (isMounted) {
          setPage(loadedPage);
          setDocument(loadedPage.document);
          setTitle(loadedPage.title);
          setAssets(assetResponse.assets);
          setSelectedLayerId(loadedPage.document.layers[0]?.id ?? null);
          setStatus("saved");
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError));
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, pageId]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedLayer = useMemo(
    () => document?.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [document, selectedLayerId],
  );

  const editDocument = (nextDocument: PageDocument) => {
    setDocument(nextDocument);
    setStatus("unsaved");
  };

  const updateSelectedLayer = (update: Partial<PageLayer>) => {
    if (!document || !selectedLayerId) {
      return;
    }

    editDocument(updateLayer(document, selectedLayerId, update));
  };

  const addText = () => {
    if (!document) {
      return;
    }

    const layer = createTextLayer({ text: "New text", name: "Text" });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };

  const addPhoto = (asset: Asset) => {
    if (!document) {
      return;
    }

    const layer = createPhotoLayer({
      assetId: asset.id,
      name: asset.originalFilename,
      width: Math.min(document.canvas.width * 0.5, 1000),
      height: Math.min(document.canvas.height * 0.34, 760),
    });
    editDocument(addLayer(document, layer));
    setSelectedLayerId(layer.id);
  };

  const savePage = async () => {
    if (!page || !document) {
      return;
    }

    setStatus("saving");
    setError(null);

    try {
      const savedPage = await apiClient.updatePage(page.id, { title, document });
      setPage(savedPage);
      setDocument(savedPage.document);
      setTitle(savedPage.title);
      setStatus("saved");
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError));
      setStatus("error");
    }
  };

  const duplicatePage = async () => {
    if (!page) {
      return;
    }

    setError(null);

    try {
      const duplicated = await apiClient.duplicatePage(page.id, { title: `${title} copy` });
      navigate(`/pages/${duplicated.id}`);
    } catch (duplicateError: unknown) {
      setError(getErrorMessage(duplicateError));
    }
  };

  const deletePage = async () => {
    if (!page) {
      return;
    }

    setError(null);

    try {
      await apiClient.deletePage(page.id);
      navigate("/pages", { replace: true });
    } catch (deleteError: unknown) {
      setError(getErrorMessage(deleteError));
    }
  };

  if (status === "loading" || !document || !page) {
    return (
      <>
        <WorkspaceHeader title="Editor" />
        {error ? (
          <p className="panel-alert" role="alert">
            {error}
          </p>
        ) : (
          <p className="empty-state">Loading page</p>
        )}
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader title="Editor">
        <button type="button" className="secondary-button" onClick={() => navigate("/pages")}>
          Back
        </button>
        <button type="button" className="secondary-button" onClick={duplicatePage}>
          Duplicate
        </button>
        <button type="button" className="secondary-button" onClick={deletePage}>
          Delete
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={status === "saving"}
          onClick={savePage}
        >
          {status === "saving" ? "Saving" : "Save"}
        </button>
      </WorkspaceHeader>

      {error ? (
        <p className="panel-alert" role="alert">
          {error}
        </p>
      ) : null}

      <div className="editor-shell">
        <aside className="editor-panel editor-asset-rail" aria-label="Assets">
          <div className="panel-heading compact-heading">
            <h3>Assets</h3>
            <span>{assets.length}</span>
          </div>
          <div className="asset-rail-list">
            {assets.length === 0 ? <p className="empty-state">No assets yet</p> : null}
            {assets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className="asset-rail-item"
                onClick={() => addPhoto(asset)}
              >
                <img src={asset.thumbnailUrl ?? asset.originalContentUrl} alt="" />
                <span>{asset.originalFilename}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-stage" aria-label="Page canvas">
          <fieldset className="editor-toolbar">
            <legend className="visually-hidden">Editor tools</legend>
            <label>
              <span>Title</span>
              <input
                value={title}
                maxLength={120}
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                  setStatus("unsaved");
                }}
              />
            </label>
            <label>
              <span>Background</span>
              <input
                type="color"
                value={document.canvas.backgroundColor}
                onChange={(event) =>
                  editDocument(
                    updateCanvas(document, { backgroundColor: event.currentTarget.value }),
                  )
                }
              />
            </label>
            <button type="button" className="secondary-button" onClick={addText}>
              T
            </button>
            <span className={`save-badge ${status}`}>{status}</span>
          </fieldset>

          <PageCanvas
            assetById={assetById}
            document={document}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
          />
        </section>

        <aside className="editor-panel" aria-label="Layer controls">
          <div className="panel-heading compact-heading">
            <h3>Layers</h3>
            <span>{document.layers.length}</span>
          </div>
          <LayerList
            document={document}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onChange={editDocument}
          />
          <LayerInspector layer={selectedLayer} onChange={updateSelectedLayer} />
        </aside>
      </div>
    </>
  );
}

function BooksView() {
  return (
    <>
      <WorkspaceHeader title="Books">
        <button type="button" className="primary-button">
          New book
        </button>
      </WorkspaceHeader>
      <div className="workspace-grid split-grid">
        <Panel title="Books" count={String(bookItems.length)}>
          <List items={bookItems} />
        </Panel>
        <Panel title="Book pages" count="0">
          <p className="empty-state">Book page ordering arrives in the books phase.</p>
        </Panel>
      </div>
    </>
  );
}

function PageList({ pages }: { pages: PageSummary[] }) {
  const navigate = useNavigate();

  return (
    <ol className="item-list page-list">
      {pages.map((page) => (
        <li key={page.id}>
          <button type="button" onClick={() => navigate(`/pages/${page.id}`)}>
            <span>{page.title}</span>
            <span>
              {page.layerCount} layers / {page.width} x {page.height}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function PageCanvas({
  assetById,
  document,
  selectedLayerId,
  onSelectLayer,
}: {
  assetById: Map<string, Asset>;
  document: PageDocument;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
}) {
  return (
    <div
      className="editor-canvas"
      style={{
        aspectRatio: `${document.canvas.width} / ${document.canvas.height}`,
        background: document.canvas.backgroundColor,
      }}
    >
      {document.layers.map((layer) => {
        const layerStyle: CSSProperties = {
          left: `${(layer.x / document.canvas.width) * 100}%`,
          top: `${(layer.y / document.canvas.height) * 100}%`,
          width: `${(layer.width / document.canvas.width) * 100}%`,
          height: `${(layer.height / document.canvas.height) * 100}%`,
          opacity: layer.opacity,
          transform: `rotate(${layer.rotation}deg)`,
        };

        return (
          <button
            type="button"
            key={layer.id}
            className="canvas-layer"
            data-selected={layer.id === selectedLayerId}
            style={layerStyle}
            onClick={() => onSelectLayer(layer.id)}
          >
            {layer.kind === "photo" ? (
              <img
                src={
                  assetById.get(layer.assetId)?.thumbnailUrl ??
                  assetById.get(layer.assetId)?.originalContentUrl
                }
                alt=""
                style={{ objectFit: layer.fit }}
              />
            ) : (
              <span
                style={{
                  color: layer.color,
                  fontFamily: layer.fontFamily,
                  fontSize: `${Math.max(10, Math.min(42, layer.fontSize / 3))}px`,
                  textAlign: layer.align,
                }}
              >
                {layer.text}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function LayerList({
  document,
  selectedLayerId,
  onSelectLayer,
  onChange,
}: {
  document: PageDocument;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onChange: (document: PageDocument) => void;
}) {
  return (
    <ol className="layer-list">
      {document.layers.map((layer, layerIndex) => (
        <li key={layer.id} data-selected={layer.id === selectedLayerId}>
          <button type="button" className="layer-select" onClick={() => onSelectLayer(layer.id)}>
            <span>{layer.name}</span>
            <span>{layer.kind}</span>
          </button>
          <div className="layer-actions">
            <button
              type="button"
              disabled={layerIndex === 0}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex - 1))}
            >
              Up
            </button>
            <button
              type="button"
              disabled={layerIndex === document.layers.length - 1}
              onClick={() => onChange(reorderLayer(document, layer.id, layerIndex + 1))}
            >
              Down
            </button>
            <button type="button" onClick={() => onChange(duplicateLayer(document, layer.id))}>
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(deleteLayer(document, layer.id));
                onSelectLayer(null);
              }}
            >
              Del
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LayerInspector({
  layer,
  onChange,
}: {
  layer: PageLayer | null;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  if (!layer) {
    return <p className="empty-state">Select a layer to edit it.</p>;
  }

  const updateNumber =
    (key: "height" | "opacity" | "rotation" | "width" | "x" | "y") =>
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange({ [key]: Number(event.currentTarget.value) } as Partial<PageLayer>);

  return (
    <form className="inspector-form">
      <label>
        <span>Name</span>
        <input
          value={layer.name}
          maxLength={120}
          onChange={(event) => onChange({ name: event.currentTarget.value })}
        />
      </label>
      <div className="inspector-grid">
        <label>
          <span>X</span>
          <input type="number" value={layer.x} onChange={updateNumber("x")} />
        </label>
        <label>
          <span>Y</span>
          <input type="number" value={layer.y} onChange={updateNumber("y")} />
        </label>
        <label>
          <span>W</span>
          <input min={1} type="number" value={layer.width} onChange={updateNumber("width")} />
        </label>
        <label>
          <span>H</span>
          <input min={1} type="number" value={layer.height} onChange={updateNumber("height")} />
        </label>
      </div>
      <label>
        <span>Rotation</span>
        <input type="number" value={layer.rotation} onChange={updateNumber("rotation")} />
      </label>
      <label>
        <span>Opacity</span>
        <input
          max={1}
          min={0}
          step={0.05}
          type="range"
          value={layer.opacity}
          onChange={updateNumber("opacity")}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={layer.locked}
          onChange={(event) => onChange({ locked: event.currentTarget.checked })}
        />
        <span>Locked</span>
      </label>
      {layer.kind === "text" ? (
        <>
          <label>
            <span>Text</span>
            <textarea
              value={layer.text}
              onChange={(event) =>
                onChange({ text: event.currentTarget.value } as Partial<PageLayer>)
              }
            />
          </label>
          <label>
            <span>Font size</span>
            <input
              max={240}
              min={6}
              type="number"
              value={layer.fontSize}
              onChange={(event) =>
                onChange({ fontSize: Number(event.currentTarget.value) } as Partial<PageLayer>)
              }
            />
          </label>
          <label>
            <span>Color</span>
            <input
              type="color"
              value={layer.color}
              onChange={(event) =>
                onChange({ color: event.currentTarget.value } as Partial<PageLayer>)
              }
            />
          </label>
          <label>
            <span>Align</span>
            <select
              value={layer.align}
              onChange={(event) =>
                onChange({ align: event.currentTarget.value } as Partial<PageLayer>)
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </>
      ) : (
        <label>
          <span>Fit</span>
          <select
            value={layer.fit}
            onChange={(event) => onChange({ fit: event.currentTarget.value } as Partial<PageLayer>)}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
        </label>
      )}
    </form>
  );
}

function SettingsView({ session }: { session: AuthSession }) {
  return (
    <>
      <WorkspaceHeader title="Settings" />
      <div className="settings-grid">
        <Panel title="Account">
          <dl className="metadata-list">
            <div>
              <dt>Name</dt>
              <dd>{session.account.displayName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{session.account.primaryEmail}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Session">
          <dl className="metadata-list">
            <div>
              <dt>Session</dt>
              <dd>{session.session.id}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{new Date(session.session.expiresAt).toLocaleString()}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ol className="item-list">
      {items.map((item) => (
        <li key={item}>
          <button type="button">{item}</button>
        </li>
      ))}
    </ol>
  );
}
