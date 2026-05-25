import {
  TextAlignCenterRegular,
  TextAlignLeftRegular,
  TextAlignRightRegular,
} from "@fluentui/react-icons";
import type { PageLayer } from "@scrapbook/editor-core";
import type { ReactNode } from "react";

type TextAlignment = Extract<PageLayer, { kind: "text" }>["align"];

const textAlignmentOptions: { icon: ReactNode; label: string; value: TextAlignment }[] = [
  { icon: <TextAlignLeftRegular />, label: "Align left", value: "left" },
  { icon: <TextAlignCenterRegular />, label: "Align center", value: "center" },
  { icon: <TextAlignRightRegular />, label: "Align right", value: "right" },
];

export function TextAlignmentControl({
  className,
  compact = false,
  value,
  onChange,
}: {
  className?: string;
  compact?: boolean;
  value: TextAlignment;
  onChange: (value: TextAlignment) => void;
}) {
  return (
    <fieldset
      className={["text-alignment-selector", className].filter(Boolean).join(" ")}
      data-compact={compact}
    >
      <legend className="visually-hidden">Text alignment</legend>
      {textAlignmentOptions.map((option) => (
        <button
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          key={option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </fieldset>
  );
}
