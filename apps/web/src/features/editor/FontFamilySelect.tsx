import { editorFontDefinitions } from "@scrapbook/editor-core";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const recentFontStorageKey = "scrapbook.recentFontIds";
const defaultRecentFontIds = ["google-caslon", "google-caslon-italic", "google-new-baskerville"];
const defaultRecommendedFontIds = [
  "google-caslon-italic",
  "google-caslon-bold-italic",
  "google-baskerville",
];
const playfulRecommendedFontIds = [
  "google-love-ya-like-a-sister",
  "google-pacifico",
  "google-monte-carlo",
];
const sansRecommendedFontIds = ["google-avenir", "google-helvetica-neue", "google-futura-lt"];
const quickFontLabels = new Map([["google-love-ya-like-a-sister", "Love Ya Sister"]]);

const fontStyle = (fontFamily: string): CSSProperties => ({ fontFamily });

type FontOption = {
  category: string;
  family: string;
  id: string;
  label: string;
  matchKind: string;
  triggerLabel: string;
};

type FontOptionGroup = {
  id: string;
  label: string;
  options: FontOption[];
};

const uniqueOptions = (fontOptions: FontOption[]): FontOption[] => {
  const seenFontIds = new Set<string>();

  return fontOptions.filter((fontOption) => {
    if (seenFontIds.has(fontOption.id)) {
      return false;
    }

    seenFontIds.add(fontOption.id);

    return true;
  });
};

const optionsFromIds = (fontIds: readonly string[], options: FontOption[]): FontOption[] =>
  uniqueOptions(
    fontIds.flatMap((fontId) => {
      const fontOption = options.find((option) => option.id === fontId);

      return fontOption ? [fontOption] : [];
    }),
  );

const sortOptionsByLabel = (options: FontOption[]): FontOption[] =>
  [...options].sort((firstOption, secondOption) =>
    firstOption.label.localeCompare(secondOption.label),
  );

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
  const [recentFontIds, setRecentFontIds] = useState<readonly string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const listboxId = `${id}-listbox`;
  const options = useMemo<FontOption[]>(() => {
    const knownOptions = editorFontDefinitions.map((fontDefinition) => ({
      category: fontDefinition.category,
      family: fontDefinition.family,
      id: fontDefinition.id,
      label: compact
        ? (quickFontLabels.get(fontDefinition.id) ?? fontDefinition.label)
        : fontDefinition.label,
      matchKind: fontDefinition.matchKind,
      triggerLabel: compact
        ? (quickFontLabels.get(fontDefinition.id) ?? fontDefinition.label)
        : fontDefinition.label,
    }));

    return knownOptions.some((fontOption) => fontOption.family === value)
      ? knownOptions
      : [
          ...knownOptions,
          {
            category: "custom",
            family: value,
            id: "custom",
            label: value,
            matchKind: "custom",
            triggerLabel: value,
          },
        ];
  }, [compact, value]);
  const selectedOption = options.find((fontOption) => fontOption.family === value) ?? options[0];
  const optionGroups = useMemo<FontOptionGroup[]>(() => {
    const rememberedOptions = optionsFromIds(recentFontIds, options);
    const defaultRecentOptions = optionsFromIds(defaultRecentFontIds, options);
    const recentOptions = uniqueOptions([
      ...(selectedOption ? [selectedOption] : []),
      ...rememberedOptions,
      ...defaultRecentOptions,
    ]).slice(0, 3);
    const recommendedIds =
      selectedOption?.category === "playful"
        ? playfulRecommendedFontIds
        : selectedOption?.category === "sans"
          ? sansRecommendedFontIds
          : defaultRecommendedFontIds;
    const recommendedOptions = uniqueOptions([
      ...optionsFromIds(recommendedIds, options),
      ...options.filter(
        (fontOption) =>
          fontOption.category === selectedOption?.category &&
          fontOption.matchKind !== "substitute" &&
          fontOption.id !== selectedOption?.id,
      ),
    ]).slice(0, 3);
    const allOptions = sortOptionsByLabel(options);

    return [
      { id: "recent", label: "Recently used", options: recentOptions },
      { id: "recommended", label: "Recommended", options: recommendedOptions },
      { id: "all", label: "All", options: allOptions },
    ].filter((optionGroup) => optionGroup.options.length > 0);
  }, [options, recentFontIds, selectedOption]);

  useEffect(() => {
    try {
      const recentFontsJson = globalThis.localStorage?.getItem(recentFontStorageKey);
      const parsedRecentFonts: unknown = recentFontsJson ? JSON.parse(recentFontsJson) : [];

      if (Array.isArray(parsedRecentFonts)) {
        setRecentFontIds(
          parsedRecentFonts.filter((fontId): fontId is string => typeof fontId === "string"),
        );
      }
    } catch {
      setRecentFontIds([]);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    selectedOptionRef.current?.scrollIntoView({ block: "nearest" });

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    globalThis.document.addEventListener("pointerdown", closeOnPointerDown);

    return () => globalThis.document.removeEventListener("pointerdown", closeOnPointerDown);
  }, [isOpen]);

  const chooseFont = (fontOption: FontOption) => {
    setRecentFontIds((currentRecentFontIds) => {
      const nextRecentFontIds = [
        fontOption.id,
        ...currentRecentFontIds.filter((fontId) => fontId !== fontOption.id),
      ].slice(0, 6);

      try {
        globalThis.localStorage?.setItem(recentFontStorageKey, JSON.stringify(nextRecentFontIds));
      } catch {
        return nextRecentFontIds;
      }

      return nextRecentFontIds;
    });
    onChange(fontOption.family);
    setIsOpen(false);
  };

  let assignedSelectedOptionRef = false;

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
        <span>{selectedOption?.triggerLabel ?? value}</span>
      </button>
      {isOpen ? (
        <div className="font-family-select-listbox" id={listboxId} role="listbox">
          {optionGroups.map((optionGroup) => (
            <div className="font-family-select-section" key={optionGroup.id}>
              <div className="font-family-select-section-title">{optionGroup.label}</div>
              <div className="font-family-select-options-grid">
                {optionGroup.options.map((fontOption) => {
                  const isSelected = fontOption.family === value;
                  const isMarkedSelected = isSelected && !assignedSelectedOptionRef;
                  const optionRef = isMarkedSelected ? selectedOptionRef : undefined;

                  if (isSelected) {
                    assignedSelectedOptionRef = true;
                  }

                  return (
                    <button
                      type="button"
                      aria-selected={isMarkedSelected}
                      className="font-family-select-option"
                      key={`${optionGroup.id}-${fontOption.id}`}
                      ref={optionRef}
                      role="option"
                      style={fontStyle(fontOption.family)}
                      onClick={() => chooseFont(fontOption)}
                    >
                      {fontOption.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
