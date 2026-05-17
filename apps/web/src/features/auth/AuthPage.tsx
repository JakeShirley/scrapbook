import type { FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { getErrorMessage } from "../../lib/errors";
import type { AuthMode } from "../../types";

export function AuthPage({
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
