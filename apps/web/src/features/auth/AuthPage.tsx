import {
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Tab,
  TabList,
} from "@fluentui/react-components";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { apiClient } from "../../apiClient";
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
  const [version, setVersion] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    apiClient
      .getHealth()
      .then((health) => {
        if (isMounted) {
          setVersion(health.version);
        }
      })
      .catch(() => {
        // Hide the version line if the health endpoint is unreachable.
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
            {version ? <p>{version}</p> : null}
          </div>
        </div>

        <TabList
          className="segmented-control"
          aria-label="Authentication mode"
          selectedValue={mode}
          onTabSelect={(_, data) => setMode(data.value as AuthMode)}
        >
          <Tab value="login">Sign in</Tab>
          <Tab value="register">Create account</Tab>
        </TabList>

        {error ? (
          <MessageBar className="alert" intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : null}

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <Field label="Name">
              <Input autoComplete="name" maxLength={120} name="displayName" required />
            </Field>
          ) : null}
          <Field label="Email">
            <Input autoComplete="email" maxLength={320} name="email" required type="email" />
          </Field>
          <Field label="Password">
            <Input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={256}
              minLength={mode === "register" ? 12 : 1}
              name="password"
              required
              type="password"
            />
          </Field>
          <Button
            appearance="primary"
            className="primary-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Working" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </section>
    </main>
  );
}
