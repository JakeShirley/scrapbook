import type { PageLayer, PhotoLayer } from "@scrapbook/editor-core";
import type { ChangeEvent } from "react";

import { EmbellishmentControls } from "./EmbellishmentControls";
import { PhotoControls } from "./PhotoControls";
import { TextControls } from "./TextControls";

export function LayerInspector({
  layer,
  onChange,
}: {
  layer: PageLayer | null;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  if (!layer) return <p className="empty-state">Select a layer to edit it.</p>;
  const updateNumber =
    (key: "height" | "opacity" | "rotation" | "width" | "x" | "y") =>
    (event: ChangeEvent<HTMLInputElement>) =>
      onChange({ [key]: Number(event.currentTarget.value) } as Partial<PageLayer>);
  const updatePhotoLayer = (update: Partial<PhotoLayer>) => onChange(update as Partial<PageLayer>);

  return (
    <form className="inspector-form">
      <fieldset className="inspector-section layer-inspector-section">
        <legend>Layer</legend>
        <div className="layer-controls-grid">
          <label>
            <span>X</span>
            <input type="number" value={layer.x} onChange={updateNumber("x")} />
          </label>
          <label>
            <span>Y</span>
            <input type="number" value={layer.y} onChange={updateNumber("y")} />
          </label>
          <label>
            <span>W</span>
            <input min={1} type="number" value={layer.width} onChange={updateNumber("width")} />
          </label>
          <label>
            <span>H</span>
            <input min={1} type="number" value={layer.height} onChange={updateNumber("height")} />
          </label>
          <label className="rotation-field">
            <span>Rotation</span>
            <input type="number" value={layer.rotation} onChange={updateNumber("rotation")} />
          </label>
          <label className="opacity-field">
            <span>Opacity</span>
            <input
              max={1}
              min={0}
              step={0.05}
              type="range"
              value={layer.opacity}
              onChange={updateNumber("opacity")}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={layer.locked}
              onChange={(event) => onChange({ locked: event.currentTarget.checked })}
            />
            <span>Locked</span>
          </label>
        </div>
      </fieldset>
      {layer.kind === "text" ? <TextControls layer={layer} onChange={onChange} /> : null}
      {layer.kind === "photo" ? <PhotoControls layer={layer} onChange={updatePhotoLayer} /> : null}
      {layer.kind === "embellishment" ? (
        <EmbellishmentControls layer={layer} onChange={onChange} />
      ) : null}
    </form>
  );
}
