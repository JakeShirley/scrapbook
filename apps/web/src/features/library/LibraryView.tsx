import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { apiClient } from "../../apiClient";
import { Panel, WorkspaceHeader } from "../../components/layout";
import { getErrorMessage } from "../../lib/errors";
import { formatBytes, formatDimensions } from "../../lib/format";
import type { Asset } from "../../types";

export function LibraryView() {
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
