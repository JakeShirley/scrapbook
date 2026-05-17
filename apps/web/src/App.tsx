import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from "react-router";

import { ApiClientError, apiClient } from "./apiClient";

type AuthSession = Awaited<ReturnType<typeof apiClient.getCurrentSession>>;
type Asset = Awaited<ReturnType<typeof apiClient.listAssets>>["assets"][number];

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

const pageItems = ["Cover", "Page 01", "Page 02"];
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
        <button type="button" className="primary-button">
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

        <Panel title="Pages" count={String(pageItems.length)}>
          <List items={pageItems} />
        </Panel>
      </div>
    </>
  );
}

function PagesView() {
  return (
    <>
      <WorkspaceHeader title="Pages">
        <button type="button" className="primary-button">
          New page
        </button>
      </WorkspaceHeader>
      <div className="workspace-grid split-grid">
        <Panel title="Pages" count={String(pageItems.length)}>
          <List items={pageItems} />
        </Panel>
        <Panel title="Selected page" count="8.5 x 11">
          <PagePreview />
        </Panel>
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
        <Panel title="Book pages" count={String(pageItems.length)}>
          <List items={pageItems} />
        </Panel>
      </div>
    </>
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

function PagePreview() {
  return (
    <div className="canvas-surface" role="img" aria-label="Page preview">
      <div className="photo-slot large-slot" />
      <div className="photo-slot small-slot" />
      <div className="text-strip" />
    </div>
  );
}
