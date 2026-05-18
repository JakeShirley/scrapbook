import { Button } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { createPageDocument } from "@scrapbook/editor-core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { apiClient } from "../../apiClient";
import { Panel, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import type { PageSummary } from "../../types";

export function PagesView() {
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
        <Button
          appearance="primary"
          type="button"
          className="primary-button"
          disabled={isCreating}
          icon={<AddRegular />}
          onClick={createPage}
        >
          New page
        </Button>
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
