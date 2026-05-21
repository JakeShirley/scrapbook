import { editorFontDefinitions } from "@scrapbook/editor-core";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const quickFontLabels = new Map([["love-ya-like-a-sister", "Love Ya Sister"]]);

const fontStyle = (fontFamily: string): CSSProperties => ({ fontFamily });

type FontOption = {
  family: string;
  id: string;
  label: string;
};

export function FontFamilySelect({
  compact = false,
  id,
  value,
  onChange,
}: {
  compact?: boolean;
  id: string;
  value: string;
  onChange: (fontFamily: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = `${id}-listbox`;
  const options = useMemo<FontOption[]>(() => {
    const knownOptions = editorFontDefinitions.map((fontDefinition) => ({
      family: fontDefinition.family,
      id: fontDefinition.id,
      label: compact
        ? (quickFontLabels.get(fontDefinition.id) ?? fontDefinition.label)
        : fontDefinition.label,
    }));

    return knownOptions.some((fontOption) => fontOption.family === value)
      ? knownOptions
      : [...knownOptions, { family: value, id: "custom", label: value }];
  }, [compact, value]);
  const selectedOption = options.find((fontOption) => fontOption.family === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    globalThis.document.addEventListener("pointerdown", closeOnPointerDown);

    return () => globalThis.document.removeEventListener("pointerdown", closeOnPointerDown);
  }, [isOpen]);

  const chooseFont = (fontFamily: string) => {
    onChange(fontFamily);
    setIsOpen(false);
  };

  return (
    <div className="font-family-select" data-compact={compact ? "true" : undefined} ref={rootRef}>
      <button
        type="button"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Font"
        className="font-family-select-trigger"
        id={id}
        style={fontStyle(value)}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }

          if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
      >
        <span>{selectedOption?.label ?? value}</span>
      </button>
      {isOpen ? (
        <div className="font-family-select-listbox" id={listboxId} role="listbox">
          {options.map((fontOption) => (
            <button
              type="button"
              aria-selected={fontOption.family === value}
              className="font-family-select-option"
              key={fontOption.id}
              role="option"
              style={fontStyle(fontOption.family)}
              onClick={() => chooseFont(fontOption.family)}
            >
              {fontOption.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
