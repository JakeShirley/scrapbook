import { marked } from "marked";
import { useMemo } from "react";

import { AppModal } from "../../components/layout";
import { appVersion, changelogMarkdown } from "../../generated/changelog";

marked.setOptions({ async: false });

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const renderedHtml = useMemo(() => marked.parse(changelogMarkdown) as string, []);

  return (
    <AppModal title={'Changelog'} size="wide" onClose={onClose}>
      <div
        className="changelog-content"
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: Changelog markdown is generated at build time from our own git history. */
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </AppModal>
  );
}
