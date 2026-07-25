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

const markdownEscapePattern = /[\\`*_[\]]/g;

export const escapeMarkdownText = (text: string): string =>
  text.replace(markdownEscapePattern, (marker) => `\\${marker}`);

const mergeRuns = (runs: readonly RichTextRun[]): RichTextRun[] => {
  const merged: RichTextRun[] = [];
  for (const run of runs) {
    appendRun(merged, run.text, run.bold, run.italic);
  }

  return merged;
};

const runToMarkdown = (run: RichTextRun): string => {
  const escaped = escapeMarkdownText(run.text);
  const marker = `${run.bold ? "**" : ""}${run.italic ? "*" : ""}`;
  if (marker.length === 0) return escaped;

  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(escaped);
  const leading = match?.[1] ?? "";
  const core = match?.[2] ?? "";
  const trailing = match?.[3] ?? "";
  if (core.length === 0) return escaped;

  return `${leading}${marker}${core}${marker}${trailing}`;
};

export const runsToMarkdown = (paragraphs: readonly RichTextParagraph[]): string =>
  paragraphs.map((runs) => mergeRuns(runs).map(runToMarkdown).join("")).join("\n");

export const normalizeRichText = (text: string): string => runsToMarkdown(parseRichText(text));

export const richTextLength = (text: string): number =>
  richTextToPlainString(parseRichText(text)).length;

type StyledCharacter = {
  char: string;
  bold: boolean;
  italic: boolean;
};

const paragraphsToCharacters = (paragraphs: readonly RichTextParagraph[]): StyledCharacter[] => {
  const characters: StyledCharacter[] = [];
  paragraphs.forEach((runs, index) => {
    if (index > 0) characters.push({ char: "\n", bold: false, italic: false });
    for (const run of runs) {
      for (const char of run.text.split("")) {
        characters.push({ char, bold: run.bold, italic: run.italic });
      }
    }
  });

  return characters;
};

const charactersToParagraphs = (characters: readonly StyledCharacter[]): RichTextParagraph[] => {
  const paragraphs: RichTextParagraph[] = [[]];
  for (const character of characters) {
    if (character.char === "\n") {
      paragraphs.push([]);
      continue;
    }

    const current = paragraphs[paragraphs.length - 1];
    if (current) appendRun(current, character.char, character.bold, character.italic);
  }

  return paragraphs;
};

const clampOffset = (value: number, max: number): number => {
  if (!Number.isFinite(value)) return max;

  return Math.min(Math.max(Math.trunc(value), 0), max);
};

const withStyle = (
  character: StyledCharacter,
  style: RichTextStyle,
  enabled: boolean,
): StyledCharacter =>
  style === "bold" ? { ...character, bold: enabled } : { ...character, italic: enabled };

const styleToggleInsertion = "text";

export const toggleRichTextStyle = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
  style: RichTextStyle,
): RichTextEdit => {
  const characters = paragraphsToCharacters(parseRichText(text));
  const start = clampOffset(Math.min(selectionStart, selectionEnd), characters.length);
  const end = clampOffset(Math.max(selectionStart, selectionEnd), characters.length);

  if (start === end) {
    const inserted = styleToggleInsertion.split("").map((char) => ({
      char,
      bold: style === "bold",
      italic: style === "italic",
    }));
    const next = [...characters.slice(0, start), ...inserted, ...characters.slice(start)];

    return {
      text: runsToMarkdown(charactersToParagraphs(next)),
      selectionStart: start,
      selectionEnd: start + inserted.length,
    };
  }

  const selected = characters.slice(start, end).filter((character) => character.char !== "\n");
  const enabled = selected.length === 0 || !selected.every((character) => character[style]);
  const next = characters.map((character, index) =>
    index >= start && index < end && character.char !== "\n"
      ? withStyle(character, style, enabled)
      : character,
  );

  return {
    text: runsToMarkdown(charactersToParagraphs(next)),
    selectionStart: start,
    selectionEnd: end,
  };
};

export const replaceRichTextRange = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insertedText: string,
): RichTextEdit => {
  const characters = paragraphsToCharacters(parseRichText(text));
  const start = clampOffset(Math.min(selectionStart, selectionEnd), characters.length);
  const end = clampOffset(Math.max(selectionStart, selectionEnd), characters.length);
  const inheritedFrom = characters[start - 1] ?? characters[end] ?? null;
  const bold = inheritedFrom?.char === "\n" ? false : (inheritedFrom?.bold ?? false);
  const italic = inheritedFrom?.char === "\n" ? false : (inheritedFrom?.italic ?? false);
  const inserted = insertedText
    .replace(/\r\n?/g, "\n")
    .split("")
    .map((char) => ({
      char,
      bold: char === "\n" ? false : bold,
      italic: char === "\n" ? false : italic,
    }));
  const next = [...characters.slice(0, start), ...inserted, ...characters.slice(end)];

  return {
    text: runsToMarkdown(charactersToParagraphs(next)),
    selectionStart: start + inserted.length,
    selectionEnd: start + inserted.length,
  };
};
