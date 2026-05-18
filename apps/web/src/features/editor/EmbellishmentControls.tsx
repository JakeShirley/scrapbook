import type { PageLayer } from "@scrapbook/editor-core";

export function EmbellishmentControls({
  layer,
  onChange,
}: {
  layer: Extract<PageLayer, { kind: "embellishment" }>;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  return (
    <>
      <label>
        <span>Label</span>
        <input
          maxLength={80}
          value={layer.label}
          onChange={(event) => onChange({ label: event.currentTarget.value } as Partial<PageLayer>)}
        />
      </label>
      <div className="inspector-grid">
        <label>
          <span>Color</span>
          <input
            type="color"
            value={layer.color}
            onChange={(event) =>
              onChange({ color: event.currentTarget.value } as Partial<PageLayer>)
            }
          />
        </label>
        <label>
          <span>Accent</span>
          <input
            type="color"
            value={layer.accentColor}
            onChange={(event) =>
              onChange({ accentColor: event.currentTarget.value } as Partial<PageLayer>)
            }
          />
        </label>
      </div>
    </>
  );
}
