import { type PageLayer, renderPageDocumentSvg } from "@scrapbook/editor-core";
import { useId, useMemo, useRef } from "react";

import { NumericInput } from "../../components/NumericInput";
import { FontFamilySelect } from "./FontFamilySelect";
import { TextAlignmentControl } from "./TextAlignmentControl";

type TextLayer = Extract<PageLayer, { kind: "text" }>;
type TextEffectKey = "background" | "glow" | "shadow" | "stroke";

const wrapSelectionWithMarker = (
  source: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
): { text: string; selectionStart: number; selectionEnd: number } => {
  const before = source.slice(0, selectionStart);
  const selected = source.slice(selectionStart, selectionEnd);
  const after = source.slice(selectionEnd);
  const placeholder = selected.length > 0 ? selected : "text";
  const inserted = `${marker}${placeholder}${marker}`;
  const text = `${before}${inserted}${after}`;
  const insertionStart = before.length + marker.length;
  const insertionEnd = insertionStart + placeholder.length;
  return { text, selectionStart: insertionStart, selectionEnd: insertionEnd };
};

export function TextControls({
  layer,
  onChange,
}: {
  layer: TextLayer;
  onChange: (update: Partial<PageLayer>) => void;
}) {
  const previewId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const updateEffect = <Key extends TextEffectKey>(key: Key, update: Partial<TextLayer[Key]>) =>
    onChange({
      [key]: { ...layer[key], ...update },
    } as Partial<PageLayer>);

  const applyInlineMarker = (marker: string) => {
    const textarea = textareaRef.current;
    const source = layer.text;
    const selectionStart = textarea?.selectionStart ?? source.length;
    const selectionEnd = textarea?.selectionEnd ?? source.length;
    const result = wrapSelectionWithMarker(source, selectionStart, selectionEnd, marker);
    onChange({ text: result.text } as Partial<PageLayer>);

    requestAnimationFrame(() => {
      const liveTextarea = textareaRef.current;
      if (!liveTextarea) return;
      liveTextarea.focus();
      liveTextarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const previewSvg = useMemo(() => {
    const previewText = layer.text.trim().length > 0 ? layer.text : "Text preview";
    const padding = 24;
    const minCanvasSize = 320;
    const canvasWidth = Math.max(minCanvasSize, Math.ceil(layer.width + padding * 2));
    const canvasHeight = Math.max(minCanvasSize, Math.ceil(layer.height + padding * 2));
    const previewX = Math.round((canvasWidth - layer.width) / 2);
    const previewY = Math.round((canvasHeight - layer.height) / 2);
    const previewLayer: TextLayer = {
      ...layer,
      id: `${layer.id}-preview`,
      text: previewText,
      x: previewX,
      y: previewY,
      rotation: 0,
    };

    return renderPageDocumentSvg(
      {
        version: 1,
        canvas: {
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor: "#fffdf7",
        },
        layers: [previewLayer],
      },
      { idPrefix: previewId, includeBackground: false },
    );
  }, [layer, previewId]);

  return (
    <>
      <fieldset className="inspector-section text-controls-section">
        <legend>Text</legend>
        <div className="text-controls-grid">
          <label className="text-content-field" htmlFor="text-layer-text">
            <span>Text</span>
            <div className="text-content-toolbar" role="toolbar" aria-label="Text formatting">
              <button
                type="button"
                className="text-content-toolbar-button"
                title="Bold (Ctrl/Cmd+B) — wraps selection in **double asterisks**"
                aria-label="Bold"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyInlineMarker("**")}
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                className="text-content-toolbar-button"
                title="Italic (Ctrl/Cmd+I) — wraps selection in *single asterisks*"
                aria-label="Italic"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyInlineMarker("*")}
              >
                <em>I</em>
              </button>
              <span className="text-content-toolbar-hint">
                Use **bold**, *italic*, or ***both***.
              </span>
            </div>
            <textarea
              id="text-layer-text"
              ref={textareaRef}
              value={layer.text}
              onChange={(event) =>
                onChange({ text: event.currentTarget.value } as Partial<PageLayer>)
              }
              onKeyDown={(event) => {
                if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
                const key = event.key.toLowerCase();
                if (key === "b") {
                  event.preventDefault();
                  applyInlineMarker("**");
                } else if (key === "i") {
                  event.preventDefault();
                  applyInlineMarker("*");
                }
              }}
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
            <NumericInput
              max={240}
              min={6}
              value={layer.fontSize}
              onChange={(fontSize) => onChange({ fontSize } as Partial<PageLayer>)}
            />
          </label>
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
          <div className="text-alignment-field">
            <span>Align</span>
            <TextAlignmentControl
              value={layer.align}
              onChange={(align) => onChange({ align } as Partial<PageLayer>)}
            />
          </div>
        </div>
      </fieldset>
      <fieldset className="inspector-section text-effects-section">
        <legend>Effects</legend>
        <div className="text-effects-layout">
          <div className="text-preview-pane" role="img" aria-label="Text preview">
            <div
              className="text-preview-surface"
              /* biome-ignore lint/security/noDangerouslySetInnerHtml: Preview SVG is generated by editor-core from validated layer data. */
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          </div>
          <div className="text-effects-grid">
            <section className="text-effect-card" aria-label="Stroke">
              <label className="checkbox-label compact-checkbox">
                <input
                  type="checkbox"
                  checked={layer.stroke.enabled}
                  onChange={(event) =>
                    updateEffect("stroke", { enabled: event.currentTarget.checked })
                  }
                />
                <span>Stroke</span>
              </label>
              <div className="text-effect-controls-grid">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={layer.stroke.color}
                    onChange={(event) =>
                      updateEffect("stroke", { color: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  <span>Width</span>
                  <NumericInput
                    max={80}
                    min={0}
                    value={layer.stroke.width}
                    onChange={(width) => updateEffect("stroke", { width })}
                  />
                </label>
              </div>
            </section>
            <section className="text-effect-card text-effect-card-wide" aria-label="Drop shadow">
              <label className="checkbox-label compact-checkbox">
                <input
                  type="checkbox"
                  checked={layer.shadow.enabled}
                  onChange={(event) =>
                    updateEffect("shadow", { enabled: event.currentTarget.checked })
                  }
                />
                <span>Drop shadow</span>
              </label>
              <div className="text-effect-controls-grid text-effect-controls-grid-wide">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={layer.shadow.color}
                    onChange={(event) =>
                      updateEffect("shadow", { color: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  <span>Opacity</span>
                  <input
                    max={1}
                    min={0}
                    step={0.05}
                    type="range"
                    value={layer.shadow.opacity}
                    onChange={(event) =>
                      updateEffect("shadow", { opacity: Number(event.currentTarget.value) })
                    }
                  />
                </label>
                <label>
                  <span>X</span>
                  <NumericInput
                    max={240}
                    min={-240}
                    value={layer.shadow.offsetX}
                    onChange={(offsetX) => updateEffect("shadow", { offsetX })}
                  />
                </label>
                <label>
                  <span>Y</span>
                  <NumericInput
                    max={240}
                    min={-240}
                    value={layer.shadow.offsetY}
                    onChange={(offsetY) => updateEffect("shadow", { offsetY })}
                  />
                </label>
                <label>
                  <span>Blur</span>
                  <NumericInput
                    max={160}
                    min={0}
                    value={layer.shadow.blur}
                    onChange={(blur) => updateEffect("shadow", { blur })}
                  />
                </label>
              </div>
            </section>
            <section className="text-effect-card" aria-label="Glow">
              <label className="checkbox-label compact-checkbox">
                <input
                  type="checkbox"
                  checked={layer.glow.enabled}
                  onChange={(event) =>
                    updateEffect("glow", { enabled: event.currentTarget.checked })
                  }
                />
                <span>Glow</span>
              </label>
              <div className="text-effect-controls-grid">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={layer.glow.color}
                    onChange={(event) => updateEffect("glow", { color: event.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>Opacity</span>
                  <input
                    max={1}
                    min={0}
                    step={0.05}
                    type="range"
                    value={layer.glow.opacity}
                    onChange={(event) =>
                      updateEffect("glow", { opacity: Number(event.currentTarget.value) })
                    }
                  />
                </label>
                <label>
                  <span>Blur</span>
                  <NumericInput
                    max={160}
                    min={0}
                    value={layer.glow.blur}
                    onChange={(blur) => updateEffect("glow", { blur })}
                  />
                </label>
              </div>
            </section>
            <section className="text-effect-card" aria-label="Highlight">
              <label className="checkbox-label compact-checkbox">
                <input
                  type="checkbox"
                  checked={layer.background.enabled}
                  onChange={(event) =>
                    updateEffect("background", { enabled: event.currentTarget.checked })
                  }
                />
                <span>Highlight</span>
              </label>
              <div className="text-effect-controls-grid">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={layer.background.color}
                    onChange={(event) =>
                      updateEffect("background", { color: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  <span>Opacity</span>
                  <input
                    max={1}
                    min={0}
                    step={0.05}
                    type="range"
                    value={layer.background.opacity}
                    onChange={(event) =>
                      updateEffect("background", { opacity: Number(event.currentTarget.value) })
                    }
                  />
                </label>
                <label>
                  <span>Padding</span>
                  <NumericInput
                    max={120}
                    min={0}
                    value={layer.background.padding}
                    onChange={(padding) => updateEffect("background", { padding })}
                  />
                </label>
                <label>
                  <span>Radius</span>
                  <NumericInput
                    max={160}
                    min={0}
                    value={layer.background.radius}
                    onChange={(radius) => updateEffect("background", { radius })}
                  />
                </label>
              </div>
            </section>
          </div>
        </div>
      </fieldset>
    </>
  );
}
