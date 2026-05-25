import type { WashiTapeLayer } from "@scrapbook/editor-core";

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
    <fieldset className="inspector-section">
      <legend>Washi tape</legend>
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
      <label>
        <span>Tile scale</span>
        <input
          max={4}
          min={0.2}
          step={0.05}
          type="range"
          value={layer.tile.scale}
          onChange={(event) => updateTile({ scale: Number(event.currentTarget.value) })}
        />
      </label>
      <div className="inspector-grid">
        <label>
          <span>Scale X</span>
          <input
            max={4}
            min={0.2}
            step={0.05}
            type="number"
            value={layer.tile.scaleX}
            onChange={(event) => updateTile({ scaleX: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          <span>Scale Y</span>
          <input
            max={4}
            min={0.2}
            step={0.05}
            type="number"
            value={layer.tile.scaleY}
            onChange={(event) => updateTile({ scaleY: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
      <div className="inspector-grid">
        <label>
          <span>Pattern rotation</span>
          <input
            max={360}
            min={-360}
            step={1}
            type="number"
            value={layer.tile.rotation}
            onChange={(event) => updateTile({ rotation: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          <span>Offset X</span>
          <input
            max={1}
            min={-1}
            step={0.01}
            type="number"
            value={layer.tile.offsetX}
            onChange={(event) => updateTile({ offsetX: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          <span>Offset Y</span>
          <input
            max={1}
            min={-1}
            step={0.01}
            type="number"
            value={layer.tile.offsetY}
            onChange={(event) => updateTile({ offsetY: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
    </fieldset>
  );
}
