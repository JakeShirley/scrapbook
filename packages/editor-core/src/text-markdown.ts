import { Lexer, type Token, type Tokens } from "marked";

export type RichTextRun = {
  text: string;
  bold: boolean;
  italic: boolean;
};

export type RichTextParagraph = RichTextRun[];

const inlineLexerOptions = { gfm: false, breaks: false } as const;

const tokenContainsTokens = (token: Token): token is Token & { tokens: Token[] } =>
  Array.isArray((token as { tokens?: unknown }).tokens);

const appendRun = (runs: RichTextRun[], text: string, bold: boolean, italic: boolean): void => {
  if (text.length === 0) return;

  const previous = runs[runs.length - 1];
  if (previous && previous.bold === bold && previous.italic === italic) {
    previous.text += text;
    return;
  }

  runs.push({ text, bold, italic });
};

const walkTokens = (
  tokens: readonly Token[],
  bold: boolean,
  italic: boolean,
  runs: RichTextRun[],
): void => {
  for (const token of tokens) {
    switch (token.type) {
      case "strong": {
        const strongToken = token as Tokens.Strong;
        if (strongToken.tokens && strongToken.tokens.length > 0) {
          walkTokens(strongToken.tokens, true, italic, runs);
        } else {
          appendRun(runs, strongToken.text, true, italic);
        }
        break;
      }
      case "em": {
        const emToken = token as Tokens.Em;
        if (emToken.tokens && emToken.tokens.length > 0) {
          walkTokens(emToken.tokens, bold, true, runs);
        } else {
          appendRun(runs, emToken.text, bold, true);
        }
        break;
      }
      case "text":
      case "escape":
      case "codespan":
      case "html": {
        const text = (token as { text?: string }).text ?? "";
        appendRun(runs, text, bold, italic);
        break;
      }
      case "br": {
        appendRun(runs, "\n", bold, italic);
        break;
      }
      default: {
        if (tokenContainsTokens(token)) {
          walkTokens(token.tokens, bold, italic, runs);
        } else {
          const fallback =
            (token as { text?: string }).text ?? (token as { raw?: string }).raw ?? "";
          appendRun(runs, fallback, bold, italic);
        }
        break;
      }
    }
  }
};

export const parseInlineRuns = (paragraph: string): RichTextRun[] => {
  if (paragraph.length === 0) return [];

  const tokens = Lexer.lexInline(paragraph, inlineLexerOptions);
  const runs: RichTextRun[] = [];
  walkTokens(tokens, false, false, runs);

  return runs;
};

export const parseRichText = (text: string): RichTextParagraph[] => {
  const paragraphs = text.split(/\r?\n/);
  return paragraphs.map((paragraph) => parseInlineRuns(paragraph));
};

export const richTextToPlainString = (paragraphs: RichTextParagraph[]): string =>
  paragraphs.map((paragraph) => paragraph.map((run) => run.text).join("")).join("\n");

export const runTextLength = (runs: RichTextRun[]): number =>
  runs.reduce((total, run) => total + run.text.length, 0);

export type RichTextStyle = "bold" | "italic";

export type RichTextEdit = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

/**
 * A slice of a markdown line, mapped 1:1 onto the source characters. `marker`
 * spans are the emphasis delimiters themselves (`**`, `_`, ...) so editors can
 * keep showing the markdown while previewing the styling it produces.
 */
export type MarkdownSpan = {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
  marker: boolean;
};

const pushSpan = (
  spans: MarkdownSpan[],
  start: number,
  end: number,
  bold: boolean,
  italic: boolean,
  marker: boolean,
): void => {
  if (end <= start) return;

  const previous = spans[spans.length - 1];
  if (
    previous &&
    previous.end === start &&
    previous.bold === bold &&
    previous.italic === italic &&
    previous.marker === marker
  ) {
    previous.end = end;
    return;
  }

  spans.push({ start, end, bold, italic, marker });
};

const walkSpans = (
  tokens: readonly Token[],
  offset: number,
  bold: boolean,
  italic: boolean,
  spans: MarkdownSpan[],
): number => {
  let cursor = offset;

  for (const token of tokens) {
    const raw = (token as { raw?: string }).raw ?? "";
    const length = raw.length;

    if (token.type === "strong" || token.type === "em") {
      const markerLength = token.type === "strong" ? 2 : 1;
      const children = (token as Tokens.Strong | Tokens.Em).tokens ?? [];
      const nextBold = bold || token.type === "strong";
      const nextItalic = italic || token.type === "em";

      if (length > markerLength * 2 && children.length > 0) {
        pushSpan(spans, cursor, cursor + markerLength, nextBold, nextItalic, true);
        walkSpans(children, cursor + markerLength, nextBold, nextItalic, spans);
        pushSpan(
          spans,
          cursor + length - markerLength,
          cursor + length,
          nextBold,
          nextItalic,
          true,
        );
        cursor += length;
        continue;
      }
    }

    pushSpan(spans, cursor, cursor + length, bold, italic, false);
    cursor += length;
  }

  return cursor;
};

export const annotateInlineMarkdown = (line: string): MarkdownSpan[] => {
  if (line.length === 0) return [];

  const plainSpans: MarkdownSpan[] = [
    { start: 0, end: line.length, bold: false, italic: false, marker: false },
  ];

  try {
    const spans: MarkdownSpan[] = [];
    const cursor = walkSpans(Lexer.lexInline(line, inlineLexerOptions), 0, false, false, spans);
    if (cursor !== line.length || spans.length === 0) return plainSpans;

    return spans;
  } catch {
    return plainSpans;
  }
};

const clampOffset = (value: number, max: number): number => {
  if (!Number.isFinite(value)) return max;

  return Math.min(Math.max(Math.trunc(value), 0), max);
};

const findStyledRegion = (
  spans: readonly MarkdownSpan[],
  start: number,
  end: number,
  style: RichTextStyle,
): { opening: MarkdownSpan; closing: MarkdownSpan } | null => {
  const overlapping = spans
    .map((span, index) => ({ span, index }))
    .filter(({ span }) => span.start < end && start < span.end);
  if (overlapping.length === 0) return null;
  if (overlapping.some(({ span }) => !span.marker && !span[style])) return null;

  const firstOverlap = overlapping[0];
  const lastOverlap = overlapping[overlapping.length - 1];
  if (!firstOverlap || !lastOverlap) return null;

  let first = firstOverlap.index;
  let last = lastOverlap.index;
  while (first > 0 && spans[first - 1]?.[style]) first -= 1;
  while (last < spans.length - 1 && spans[last + 1]?.[style]) last += 1;

  const opening = spans[first];
  const closing = spans[last];
  const markerLength = style === "bold" ? 2 : 1;
  if (!opening || !closing || opening === closing) return null;
  if (!opening.marker || opening.end - opening.start !== markerLength) return null;
  if (!closing.marker || closing.end - closing.start !== markerLength) return null;

  return { opening, closing };
};

type LineEdit = {
  line: string;
  start: number;
  end: number;
};

const toggleMarkerOnLine = (
  line: string,
  start: number,
  end: number,
  style: RichTextStyle,
): LineEdit => {
  const markerLength = style === "bold" ? 2 : 1;
  const marker = style === "bold" ? "**" : "*";

  if (end > start) {
    const region = findStyledRegion(annotateInlineMarkdown(line), start, end, style);
    if (region) {
      const { opening, closing } = region;
      const next =
        line.slice(0, opening.start) +
        line.slice(opening.end, closing.start) +
        line.slice(closing.end);
      const remap = (offset: number) =>
        Math.min(Math.max(offset, opening.end), closing.start) - markerLength;

      return { line: next, start: remap(start), end: remap(end) };
    }
  }

  return {
    line: `${line.slice(0, start)}${marker}${line.slice(start, end)}${marker}${line.slice(end)}`,
    start: start + markerLength,
    end: end + markerLength,
  };
};

/**
 * Adds or removes markdown emphasis markers around the selection. The document
 * stays markdown: toggling bold on `word` produces `**word**`, and toggling it
 * again removes the markers again.
 */
export const toggleMarkdownStyle = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
  style: RichTextStyle,
): RichTextEdit => {
  const start = clampOffset(Math.min(selectionStart, selectionEnd), text.length);
  const end = clampOffset(Math.max(selectionStart, selectionEnd), text.length);

  const lines = text.split("\n");
  const editedLines: string[] = [];
  let lineStart = 0;
  let nextStart: number | null = null;
  let nextEnd: number | null = null;
  let offsetShift = 0;

  for (const line of lines) {
    const lineEnd = lineStart + line.length;
    const localStart = clampOffset(start - lineStart, line.length);
    const localEnd = clampOffset(end - lineStart, line.length);
    const intersects =
      start <= lineEnd &&
      end >= lineStart &&
      (localEnd > localStart || (start === end && start >= lineStart && start <= lineEnd));

    if (!intersects) {
      editedLines.push(line);
      lineStart = lineEnd + 1;
      continue;
    }

    const edit = toggleMarkerOnLine(line, localStart, localEnd, style);
    editedLines.push(edit.line);
    if (nextStart === null) nextStart = lineStart + offsetShift + edit.start;
    nextEnd = lineStart + offsetShift + edit.end;
    offsetShift += edit.line.length - line.length;
    lineStart = lineEnd + 1;
  }

  return {
    text: editedLines.join("\n"),
    selectionStart: nextStart ?? start,
    selectionEnd: nextEnd ?? end,
  };
};

export const replaceTextRange = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insertedText: string,
): RichTextEdit => {
  const start = clampOffset(Math.min(selectionStart, selectionEnd), text.length);
  const end = clampOffset(Math.max(selectionStart, selectionEnd), text.length);
  const inserted = insertedText.replace(/\r\n?/g, "\n");
  const caret = start + inserted.length;

  return {
    text: `${text.slice(0, start)}${inserted}${text.slice(end)}`,
    selectionStart: caret,
    selectionEnd: caret,
  };
};
