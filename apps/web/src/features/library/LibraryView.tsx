import { Button } from "@fluentui/react-components";
import { ArrowUploadRegular } from "@fluentui/react-icons";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

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

  const uploadAssets = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (files.length === 0) {
      return;
    }

    setError(null);
    setUploadProgress(0);

    const uploadedAssets: Asset[] = [];
    const failures: string[] = [];

    for (const [fileIndex, file] of files.entries()) {
      try {
        const asset = await apiClient.uploadAsset(file, (fileProgress) => {
          setUploadProgress((fileIndex + (fileProgress ?? 0)) / files.length);
        });

        uploadedAssets.push(asset);
      } catch (uploadError: unknown) {
        failures.push(`${file.name}: ${getErrorMessage(uploadError)}`);
      } finally {
        setUploadProgress((fileIndex + 1) / files.length);
      }
    }

    if (uploadedAssets.length > 0) {
      const uploadedAssetIds = new Set(uploadedAssets.map((asset) => asset.id));
      const uploadedAssetsNewestFirst = [...uploadedAssets].reverse();

      setAssets((currentAssets) => [
        ...uploadedAssetsNewestFirst,
        ...currentAssets.filter((asset) => !uploadedAssetIds.has(asset.id)),
      ]);
    }

    setError(failures.length > 0 ? failures.join(" ") : null);
    setUploadProgress(null);
  };

  return (
    <>
      <WorkspaceHeader title="Library">
        <input
          ref={fileInputRef}
          accept="image/heic,image/heif,image/jpeg,image/png,image/tiff,image/webp,image/x-adobe-dng,.heic,.heif,.tif,.tiff,.dng,.raw"
          className="visually-hidden"
          multiple
          type="file"
          onChange={uploadAssets}
        />
        <Button
          type="button"
          className="secondary-button"
          disabled={uploadProgress !== null}
          icon={<ArrowUploadRegular />}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </Button>
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
      </div>
    </>
  );
}
