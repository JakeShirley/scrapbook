import { Panel, WorkspaceHeader } from "../../components/layout";
import type { AuthSession } from "../../types";

export function SettingsView({ session }: { session: AuthSession }) {
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
