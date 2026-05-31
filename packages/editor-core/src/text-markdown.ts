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
