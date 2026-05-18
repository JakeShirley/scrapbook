import { Button } from "@fluentui/react-components";
import { BookRegular, ImageRegular, SettingsRegular, SignOutRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from "react-router";

import { ApiClientError, apiClient } from "./apiClient";
import { LoadingScreen } from "./components/layout";
import { AuthPage } from "./features/auth/AuthPage";
import { BookEditorView } from "./features/books/BookEditorView";
import { BooksView } from "./features/books/BooksView";
import { LibraryView } from "./features/library/LibraryView";
import { SettingsView } from "./features/settings/SettingsView";
import { getErrorMessage } from "./lib/errors";
import type { AuthMode, AuthSession, SessionState } from "./types";

const navItems = [
  { to: "/books", label: "Books", icon: <BookRegular /> },
  { to: "/library", label: "Photos", icon: <ImageRegular /> },
  { to: "/settings", label: "Settings", icon: <SettingsRegular /> },
] satisfies { to: string; label: string; icon: ReactNode }[];

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
            <Navigate to="/books" replace />
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
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>{session.account.primaryEmail}</p>
          <Button
            className="secondary-button"
            icon={<SignOutRegular />}
            type="button"
            onClick={logout}
          >
            Sign out
          </Button>
          {logoutError ? (
            <p className="sidebar-alert" role="alert">
              {logoutError}
            </p>
          ) : null}
        </div>
      </aside>

      <section className="workspace" aria-label="Scrapbook workspace">
        <Routes>
          <Route index element={<Navigate to="/books" replace />} />
          <Route path="library" element={<LibraryView />} />
          <Route path="books" element={<BooksView />} />
          <Route path="books/:bookId" element={<BookEditorView />} />
          <Route path="pages/*" element={<Navigate to="/books" replace />} />
          <Route path="settings" element={<SettingsView session={session} />} />
          <Route path="*" element={<Navigate to="/books" replace />} />
        </Routes>
      </section>
    </main>
  );
}
