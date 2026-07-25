import {
  parseRichText,
  replaceRichTextRange,
  type RichTextStyle,
  runsToMarkdown,
  toggleRichTextStyle,
} from "@zakka/editor-core";
import {
  type CSSProperties,
  forwardRef,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import {
  applyRichTextSelection,
  getRichTextLength,
  readRichTextParagraphs,
  readRichTextSelection,
  renderRichTextParagraphs,
  type RichTextSelection,
} from "./richTextDom";

export type RichTextEditorHandle = {
  focus: (options?: { placeCaretAtEnd?: boolean }) => void;
  toggleStyle: (style: RichTextStyle) => void;
};

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  id?: string;
  spellCheck?: boolean;
  style?: CSSProperties;
  onBlur?: (event: ReactFocusEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * Markdown-backed WYSIWYG editor: `**bold**` and `*italic*` are shown as styled
 * text while editing instead of raw markers, and edits are serialized back to
 * markdown so stored documents and exports stay unchanged.
 */
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor(
    {
      value,
      onChange,
      ariaLabel,
      className,
      id,
      spellCheck,
      style,
      onBlur,
      onKeyDown,
      onPointerDown,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const syncedValueRef = useRef<string | null>(null);
    const pendingSelectionRef = useRef<RichTextSelection | null>(null);

    useLayoutEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const pendingSelection = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      if (syncedValueRef.current === value && !pendingSelection) return;

      const hasFocus = root.ownerDocument.activeElement === root;
      const selection = pendingSelection ?? (hasFocus ? readRichTextSelection(root) : null);
      renderRichTextParagraphs(root, parseRichText(value));
      syncedValueRef.current = value;

      if (!selection) return;
      if (!hasFocus) root.focus({ preventScroll: true });
      applyRichTextSelection(root, selection);
    });

    const readMarkdown = useCallback((root: HTMLDivElement): string => {
      const markdown = runsToMarkdown(readRichTextParagraphs(root));
      syncedValueRef.current = markdown;

      return markdown;
    }, []);

    const commitEdit = useCallback(
      (edit: { text: string; selectionStart: number; selectionEnd: number }) => {
        pendingSelectionRef.current = { start: edit.selectionStart, end: edit.selectionEnd };
        syncedValueRef.current = null;
        onChange(edit.text);
      },
      [onChange],
    );

    const toggleStyle = useCallback(
      (style: RichTextStyle) => {
        const root = rootRef.current;
        if (!root) return;

        const markdown = readMarkdown(root);
        const selection = readRichTextSelection(root) ?? {
          start: getRichTextLength(root),
          end: getRichTextLength(root),
        };
        commitEdit(toggleRichTextStyle(markdown, selection.start, selection.end, style));
      },
      [commitEdit, readMarkdown],
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: (options) => {
          const root = rootRef.current;
          if (!root) return;
          root.focus({ preventScroll: true });
          if (!options?.placeCaretAtEnd) return;
          const end = getRichTextLength(root);
          applyRichTextSelection(root, { start: end, end });
        },
        toggleStyle,
      }),
      [toggleStyle],
    );

    return (
      // biome-ignore lint/a11y/useSemanticElements: a textarea cannot render inline bold/italic formatting.
      <div
        ref={rootRef}
        aria-label={ariaLabel}
        aria-multiline="true"
        className={className ? `rich-text-editor ${className}` : "rich-text-editor"}
        contentEditable
        role="textbox"
        spellCheck={spellCheck}
        style={style}
        tabIndex={0}
        onBlur={onBlur}
        onInput={(event) => {
          onChange(readMarkdown(event.currentTarget));
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "b") {
              event.preventDefault();
              toggleStyle("bold");
              return;
            }
            if (key === "i") {
              event.preventDefault();
              toggleStyle("italic");
              return;
            }
          }

          onKeyDown?.(event);
        }}
        onPaste={(event) => {
          const root = event.currentTarget;
          const pastedText = event.clipboardData.getData("text/plain");
          event.preventDefault();
          const markdown = readMarkdown(root);
          const selection = readRichTextSelection(root) ?? {
            start: getRichTextLength(root),
            end: getRichTextLength(root),
          };
          commitEdit(replaceRichTextRange(markdown, selection.start, selection.end, pastedText));
        }}
        onPointerDown={onPointerDown}
      />
    );
  },
);
