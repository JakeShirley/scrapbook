import type { WashiTapeLayer } from "@scrapbook/editor-core";
import { useId } from "react";

export const washiTapeOutlineOptions: WashiTapeLayer["outline"][] = [
  "straight",
  "angled",
  "rounded",
  "torn",
  "notched",
  "bracket",
  "pinched",
  "tapered",
  "scallop",
  "stamp",
  "wave",
];

export const formatWashiTapeOutline = (outline: WashiTapeLayer["outline"]): string =>
  outline.charAt(0).toUpperCase() + outline.slice(1);

export const washiTapePatternOptions: WashiTapeLayer["pattern"]["kind"][] = [
  "solid",
  "polkaDot",
  "stripe",
  "grid",
  "checker",
  "customPhoto",
];

export const formatWashiTapePattern = (pattern: WashiTapeLayer["pattern"]["kind"]): string => {
  switch (pattern) {
    case "solid":
      return "Solid";
    case "polkaDot":
      return "Polka dot";
    case "stripe":
      return "Stripe";
    case "grid":
      return "Grid";
    case "checker":
      return "Checker";
    case "customPhoto":
      return "Custom photo";
  }
};

export function WashiTapeControls({
  layer,
  onChange,
  onChoosePhoto,
}: {
  layer: WashiTapeLayer;
  onChange: (update: Partial<WashiTapeLayer>) => void;
  onChoosePhoto?: ((layerId: string) => void) | undefined;
}) {
  const scaleXId = useId();
  const scaleYId = useId();
  const offsetXId = useId();
  const offsetYId = useId();
  const rotationId = useId();
  const updateTile = (update: Partial<WashiTapeLayer["tile"]>) =>
    onChange({ tile: { ...layer.tile, ...update } });
  const updatePattern = (update: Partial<WashiTapeLayer["pattern"]>) =>
    onChange({ pattern: { ...layer.pattern, ...update } });
  const changePatternKind = (kind: WashiTapeLayer["pattern"]["kind"]) => {
    if (kind === "customPhoto") {
      onChoosePhoto?.(layer.id);

      if (!layer.pattern.assetId && !layer.assetId) {
        return;
      }
    }

    updatePattern({ kind });
  };

  return (
    <fieldset className="inspector-section washi-tape-controls-section">
      <legend>Washi tape</legend>
      <div className="washi-tape-settings-column">
        <label>
          <span>Outline</span>
          <select
            value={layer.outline}
            onChange={(event) =>
              onChange({ outline: event.currentTarget.value as WashiTapeLayer["outline"] })
            }
          >
            {washiTapeOutlineOptions.map((outline) => (
              <option value={outline} key={outline}>
                {formatWashiTapeOutline(outline)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Pattern</span>
          <select
            value={layer.pattern.kind}
            onChange={(event) =>
              changePatternKind(event.currentTarget.value as WashiTapeLayer["pattern"]["kind"])
            }
          >
            {washiTapePatternOptions.map((pattern) => (
              <option value={pattern} key={pattern}>
                {formatWashiTapePattern(pattern)}
              </option>
            ))}
          </select>
        </label>
        <div className="inspector-grid">
          <label>
            <span>Primary</span>
            <input
              type="color"
              value={layer.pattern.primaryColor}
              onChange={(event) => updatePattern({ primaryColor: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Secondary</span>
            <input
              type="color"
              value={layer.pattern.secondaryColor}
              onChange={(event) => updatePattern({ secondaryColor: event.currentTarget.value })}
            />
          </label>
        </div>
        {layer.pattern.kind === "customPhoto" ? (
          <button
            type="button"
            className="secondary-button full-width-button"
            onClick={() => onChoosePhoto?.(layer.id)}
          >
            Choose custom photo
          </button>
        ) : null}
        <div className="washi-tape-axis-scale-grid">
          <div className="washi-tape-axis-scale-field">
            <div className="washi-tape-slider-label-row">
              <label htmlFor={scaleXId}>Scale X</label>
              <output htmlFor={scaleXId}>{layer.tile.scaleX.toFixed(2)}</output>
            </div>
            <div className="washi-tape-slider-row">
              <input
                id={scaleXId}
                max={4}
                min={0.01}
                step={0.01}
                type="range"
                value={layer.tile.scaleX}
                onChange={(event) => updateTile({ scaleX: Number(event.currentTarget.value) })}
              />
              <button
                type="button"
                className="washi-tape-scale-reset-button"
                onClick={() => updateTile({ scaleX: 1 })}
              >
                Reset
              </button>
            </div>
          </div>
          <div className="washi-tape-axis-scale-field">
            <div className="washi-tape-slider-label-row">
              <label htmlFor={scaleYId}>Scale Y</label>
              <output htmlFor={scaleYId}>{layer.tile.scaleY.toFixed(2)}</output>
            </div>
            <div className="washi-tape-slider-row">
              <input
                id={scaleYId}
                max={4}
                min={0.01}
                step={0.01}
                type="range"
                value={layer.tile.scaleY}
                onChange={(event) => updateTile({ scaleY: Number(event.currentTarget.value) })}
              />
              <button
                type="button"
                className="washi-tape-scale-reset-button"
                onClick={() => updateTile({ scaleY: 1 })}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
        <div className="washi-tape-axis-scale-grid">
          <div className="washi-tape-axis-scale-field">
            <div className="washi-tape-slider-label-row">
              <label htmlFor={rotationId}>Pattern rotation</label>
              <output htmlFor={rotationId}>{layer.tile.rotation.toFixed(0)}</output>
            </div>
            <div className="washi-tape-slider-row">
              <input
                id={rotationId}
                max={360}
                min={-360}
                step={1}
                type="range"
                value={layer.tile.rotation}
                onChange={(event) => updateTile({ rotation: Number(event.currentTarget.value) })}
              />
              <button
                type="button"
                className="washi-tape-scale-reset-button"
                onClick={() => updateTile({ rotation: 0 })}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
        <div className="washi-tape-axis-scale-grid">
          <div className="washi-tape-axis-scale-field">
            <div className="washi-tape-slider-label-row">
              <label htmlFor={offsetXId}>Offset X</label>
              <output htmlFor={offsetXId}>{layer.tile.offsetX.toFixed(2)}</output>
            </div>
            <div className="washi-tape-slider-row">
              <input
                id={offsetXId}
                max={1}
                min={-1}
                step={0.01}
                type="range"
                value={layer.tile.offsetX}
                onChange={(event) => updateTile({ offsetX: Number(event.currentTarget.value) })}
              />
              <button
                type="button"
                className="washi-tape-scale-reset-button"
                onClick={() => updateTile({ offsetX: 0 })}
              >
                Reset
              </button>
            </div>
          </div>
          <div className="washi-tape-axis-scale-field">
            <div className="washi-tape-slider-label-row">
              <label htmlFor={offsetYId}>Offset Y</label>
              <output htmlFor={offsetYId}>{layer.tile.offsetY.toFixed(2)}</output>
            </div>
            <div className="washi-tape-slider-row">
              <input
                id={offsetYId}
                max={1}
                min={-1}
                step={0.01}
                type="range"
                value={layer.tile.offsetY}
                onChange={(event) => updateTile({ offsetY: Number(event.currentTarget.value) })}
              />
              <button
                type="button"
                className="washi-tape-scale-reset-button"
                onClick={() => updateTile({ offsetY: 0 })}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
