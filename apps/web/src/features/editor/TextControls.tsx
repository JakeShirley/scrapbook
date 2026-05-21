import type { PageLayer } from "@scrapbook/editor-core";

import { FontFamilySelect } from "./FontFamilySelect";
import { TextAlignmentControl } from "./TextAlignmentControl";

export function TextControls({
  layer,
  onChange,
}: {
  layer: Extract<PageLayer, { kind: "text" }>;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  return (
    <>
      <label>
        <span>Text</span>
        <textarea
          value={layer.text}
          onChange={(event) => onChange({ text: event.currentTarget.value } as Partial<PageLayer>)}
        />
      </label>
      <label htmlFor="text-layer-font-family">
        <span>Font</span>
        <FontFamilySelect
          id="text-layer-font-family"
          value={layer.fontFamily}
          onChange={(fontFamily) => onChange({ fontFamily } as Partial<PageLayer>)}
        />
      </label>
      <label>
        <span>Font size</span>
        <input
          max={240}
          min={6}
          type="number"
          value={layer.fontSize}
          onChange={(event) =>
            onChange({ fontSize: Number(event.currentTarget.value) } as Partial<PageLayer>)
          }
        />
      </label>
      <label>
        <span>Color</span>
        <input
          type="color"
          value={layer.color}
          onChange={(event) => onChange({ color: event.currentTarget.value } as Partial<PageLayer>)}
        />
      </label>
      <div className="text-alignment-field">
        <span>Align</span>
        <TextAlignmentControl
          value={layer.align}
          onChange={(align) => onChange({ align } as Partial<PageLayer>)}
        />
      </div>
    </>
  );
}
