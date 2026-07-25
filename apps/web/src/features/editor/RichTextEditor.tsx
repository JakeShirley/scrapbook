import { replaceTextRange, type RichTextStyle, toggleMarkdownStyle } from "@zakka/editor-core";
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
  applyMarkdownSelection,
  getMarkdownSourceLength,
  readMarkdownSelection,
  readMarkdownSource,
  renderMarkdownSource,
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
 * Markdown source editor with live styling: the `**` / `*` markers stay visible
 * and editable, but the text they wrap is rendered bold/italic as you type.
 * Removing a marker immediately drops the styling, exactly like editing the
 * markdown by hand.
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
    const renderedValueRef = useRef<string | null>(null);
    const pendingSelectionRef = useRef<RichTextSelection | null>(null);
    const composingRef = useRef(false);

    const paint = useCallback(
      (root: HTMLDivElement, text: string, selection: RichTextSelection | null) => {
        const hasFocus = root.ownerDocument.activeElement === root;
        renderMarkdownSource(root, text);
        renderedValueRef.current = text;
        if (!selection || !hasFocus) return;
        applyMarkdownSelection(root, selection);
      },
      [],
    );

    useLayoutEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      if (composingRef.current) return;

      const pendingSelection = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      if (renderedValueRef.current === value && !pendingSelection) return;

      const hasFocus = root.ownerDocument.activeElement === root;
      const selection = pendingSelection ?? (hasFocus ? readMarkdownSelection(root) : null);
      paint(root, value, selection);
    });

    const currentSelection = useCallback((root: HTMLDivElement): RichTextSelection => {
      const selection = readMarkdownSelection(root);
      if (selection) return selection;
      const end = getMarkdownSourceLength(root);

      return { start: end, end };
    }, []);

    const commitEdit = useCallback(
      (edit: { text: string; selectionStart: number; selectionEnd: number }) => {
        const root = rootRef.current;
        const selection = { start: edit.selectionStart, end: edit.selectionEnd };
        pendingSelectionRef.current = selection;
        if (root) paint(root, edit.text, selection);
        onChange(edit.text);
      },
      [onChange, paint],
    );

    const toggleStyle = useCallback(
      (style: RichTextStyle) => {
        const root = rootRef.current;
        if (!root) return;

        const text = readMarkdownSource(root);
        const selection = currentSelection(root);
        commitEdit(toggleMarkdownStyle(text, selection.start, selection.end, style));
      },
      [commitEdit, currentSelection],
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: (options) => {
          const root = rootRef.current;
          if (!root) return;
          root.focus({ preventScroll: true });
          if (!options?.placeCaretAtEnd) return;
          const end = getMarkdownSourceLength(root);
          applyMarkdownSelection(root, { start: end, end });
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
        id={id}
        role="textbox"
        spellCheck={spellCheck}
        style={style}
        tabIndex={0}
        onBlur={onBlur}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          const root = event.currentTarget;
          const text = readMarkdownSource(root);
          paint(root, text, currentSelection(root));
          onChange(text);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onInput={(event) => {
          const root = event.currentTarget;
          const text = readMarkdownSource(root);
          if (composingRef.current) {
            renderedValueRef.current = text;
            onChange(text);
            return;
          }

          // Re-render so the styling tracks the markers on every keystroke.
          paint(root, text, currentSelection(root));
          onChange(text);
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
          const text = readMarkdownSource(root);
          const selection = currentSelection(root);
          commitEdit(replaceTextRange(text, selection.start, selection.end, pastedText));
        }}
        onPointerDown={onPointerDown}
      />
    );
  },
);
