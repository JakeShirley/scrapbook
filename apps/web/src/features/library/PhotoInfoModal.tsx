import { AppModal } from "../../components/layout";
import { formatBytes, formatDimensions } from "../../lib/format";
import type { Asset } from "../../types";

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
};

const formatChecksum = (checksum: string): string => {
  if (checksum.length <= 16) {
    return checksum;
  }

  return `${checksum.slice(0, 8)}…${checksum.slice(-8)}`;
};

const previewUrlFor = (asset: Asset): string => {
  const preview = asset.variants.find((variant) => variant.kind === "preview");

  return preview?.contentUrl ?? asset.thumbnailUrl ?? asset.originalContentUrl;
};

const formatCamera = (asset: Asset): string | null => {
  const make = asset.cameraMake?.trim() ?? "";
  const model = asset.cameraModel?.trim() ?? "";

  if (!make && !model) {
    return null;
  }

  if (make && model.toLowerCase().startsWith(make.toLowerCase())) {
    return model;
  }

  return [make, model].filter(Boolean).join(" ");
};

const formatExposure = (seconds: number | null): string | null => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  if (seconds >= 1) {
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  }

  const denominator = Math.round(1 / seconds);

  return `1/${denominator}s`;
};

const formatAperture = (value: number | null): string | null => {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return `f/${value.toFixed(value >= 10 ? 0 : 1)}`;
};

const formatIso = (value: number | null): string | null =>
  value === null || !Number.isFinite(value) ? null : `ISO ${value}`;

const formatFocalLength = (asset: Asset): string | null => {
  const focal = asset.focalLengthMm;

  if (focal === null || !Number.isFinite(focal) || focal <= 0) {
    return null;
  }

  const base = `${focal.toFixed(focal >= 10 ? 0 : 1)} mm`;
  const equivalent = asset.focalLength35mmMm;

  if (equivalent && Number.isFinite(equivalent) && equivalent > 0) {
    return `${base} (${equivalent} mm equiv.)`;
  }

  return base;
};

const formatCoordinates = (asset: Asset): string | null => {
  if (asset.gpsLatitude === null || asset.gpsLongitude === null) {
    return null;
  }

  const lat = asset.gpsLatitude.toFixed(5);
  const lon = asset.gpsLongitude.toFixed(5);

  return `${lat}, ${lon}`;
};

const formatAltitude = (value: number | null): string | null => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return `${value.toFixed(1)} m`;
};

const buildCameraSettingsSummary = (asset: Asset): string | null => {
  const parts = [
    formatExposure(asset.exposureTimeSeconds),
    formatAperture(asset.fNumber),
    formatIso(asset.isoSpeed),
  ].filter((value): value is string => value !== null);

  return parts.length === 0 ? null : parts.join(" · ");
};

const mapsLinkFor = (asset: Asset): string | null => {
  if (asset.gpsLatitude === null || asset.gpsLongitude === null) {
    return null;
  }

  return `https://www.openstreetmap.org/?mlat=${asset.gpsLatitude}&mlon=${asset.gpsLongitude}#map=15/${asset.gpsLatitude}/${asset.gpsLongitude}`;
};

export function PhotoInfoModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const camera = formatCamera(asset);
  const settings = buildCameraSettingsSummary(asset);
  const focalLength = formatFocalLength(asset);
  const coordinates = formatCoordinates(asset);
  const altitude = formatAltitude(asset.gpsAltitudeMeters);
  const mapsLink = mapsLinkFor(asset);
  const hasCameraSection = camera || asset.lensModel || settings || focalLength;
  const hasLocationSection = coordinates || altitude;

  return (
    <AppModal title={asset.originalFilename} size="auto" onClose={onClose}>
      <div className="photo-info-modal">
        <div className="photo-info-preview">
          <img src={previewUrlFor(asset)} alt={asset.originalFilename} />
        </div>
        <div className="photo-info-details-stack">
          <section className="photo-info-section">
            <h4>File</h4>
            <dl className="photo-info-details">
              <div>
                <dt>Filename</dt>
                <dd>{asset.originalFilename}</dd>
              </div>
              <div>
                <dt>Date taken</dt>
                <dd>{formatTimestamp(asset.dateTaken)}</dd>
              </div>
              <div>
                <dt>Date uploaded</dt>
                <dd>{formatTimestamp(asset.createdAt)}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>{formatDimensions(asset)}</dd>
              </div>
              <div>
                <dt>File size</dt>
                <dd>{formatBytes(asset.byteSize)}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{asset.mimeType}</dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code title={asset.checksumSha256}>{formatChecksum(asset.checksumSha256)}</code>
                </dd>
              </div>
              <div>
                <dt>Original</dt>
                <dd>
                  <a href={asset.originalContentUrl} target="_blank" rel="noreferrer noopener">
                    Open original
                  </a>
                </dd>
              </div>
            </dl>
          </section>
          {hasCameraSection ? (
            <section className="photo-info-section">
              <h4>Camera</h4>
              <dl className="photo-info-details">
                {camera ? (
                  <div>
                    <dt>Camera</dt>
                    <dd>{camera}</dd>
                  </div>
                ) : null}
                {asset.lensModel ? (
                  <div>
                    <dt>Lens</dt>
                    <dd>{asset.lensModel}</dd>
                  </div>
                ) : null}
                {settings ? (
                  <div>
                    <dt>Exposure</dt>
                    <dd>{settings}</dd>
                  </div>
                ) : null}
                {focalLength ? (
                  <div>
                    <dt>Focal length</dt>
                    <dd>{focalLength}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
          {hasLocationSection ? (
            <section className="photo-info-section">
              <h4>Location</h4>
              <dl className="photo-info-details">
                {coordinates ? (
                  <div>
                    <dt>Coordinates</dt>
                    <dd>
                      {mapsLink ? (
                        <a href={mapsLink} target="_blank" rel="noreferrer noopener">
                          {coordinates}
                        </a>
                      ) : (
                        coordinates
                      )}
                    </dd>
                  </div>
                ) : null}
                {altitude ? (
                  <div>
                    <dt>Altitude</dt>
                    <dd>{altitude}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </AppModal>
  );
}
