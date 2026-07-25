import { describe, expect, it } from "vitest";

import {
  escapeMarkdownText,
  normalizeRichText,
  parseInlineRuns,
  parseRichText,
  replaceRichTextRange,
  runsToMarkdown,
  toggleRichTextStyle,
} from "./text-markdown.js";

describe("parseInlineRuns", () => {
  it("returns a single unstyled run for plain text", () => {
    expect(parseInlineRuns("hello world")).toEqual([
      { text: "hello world", bold: false, italic: false },
    ]);
  });

  it("parses **bold** with asterisks", () => {
    expect(parseInlineRuns("hello **brave** world")).toEqual([
      { text: "hello ", bold: false, italic: false },
      { text: "brave", bold: true, italic: false },
      { text: " world", bold: false, italic: false },
    ]);
  });

  it("parses __bold__ with underscores", () => {
    expect(parseInlineRuns("__loud__")).toEqual([{ text: "loud", bold: true, italic: false }]);
  });

  it("parses *italic* with asterisks", () => {
    expect(parseInlineRuns("an *important* point")).toEqual([
      { text: "an ", bold: false, italic: false },
      { text: "important", bold: false, italic: true },
      { text: " point", bold: false, italic: false },
    ]);
  });

  it("parses _italic_ with underscores", () => {
    expect(parseInlineRuns("_quietly_")).toEqual([{ text: "quietly", bold: false, italic: true }]);
  });

  it("parses ***bold italic*** combinations", () => {
    expect(parseInlineRuns("say ***hello*** now")).toEqual([
      { text: "say ", bold: false, italic: false },
      { text: "hello", bold: true, italic: true },
      { text: " now", bold: false, italic: false },
    ]);
  });

  it("supports nested italic inside bold", () => {
    expect(parseInlineRuns("**bold *and italic* end**")).toEqual([
      { text: "bold ", bold: true, italic: false },
      { text: "and italic", bold: true, italic: true },
      { text: " end", bold: true, italic: false },
    ]);
  });

  it("honors backslash escapes for markers", () => {
    expect(parseInlineRuns("price is \\*not\\* discounted")).toEqual([
      { text: "price is *not* discounted", bold: false, italic: false },
    ]);
  });

  it("treats unmatched markers as literal", () => {
    expect(parseInlineRuns("a * lone star")).toEqual([
      { text: "a * lone star", bold: false, italic: false },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseInlineRuns("")).toEqual([]);
  });
});

describe("parseRichText", () => {
  it("splits paragraphs on newline boundaries", () => {
    const result = parseRichText("hello\nworld **bold**");

    expect(result).toEqual([
      [{ text: "hello", bold: false, italic: false }],
      [
        { text: "world ", bold: false, italic: false },
        { text: "bold", bold: true, italic: false },
      ],
    ]);
  });

  it("preserves empty paragraphs", () => {
    expect(parseRichText("first\n\nthird")).toEqual([
      [{ text: "first", bold: false, italic: false }],
      [],
      [{ text: "third", bold: false, italic: false }],
    ]);
  });
});

describe("escapeMarkdownText", () => {
  it("escapes characters that would otherwise be parsed as markup", () => {
    expect(escapeMarkdownText("2 * 3 _ [x] `y` \\")).toBe("2 \\* 3 \\_ \\[x\\] \\`y\\` \\\\");
  });
});

describe("runsToMarkdown", () => {
  it("wraps styled runs in markers", () => {
    expect(
      runsToMarkdown([
        [
          { text: "hello ", bold: false, italic: false },
          { text: "brave", bold: true, italic: false },
          { text: " new ", bold: false, italic: false },
          { text: "world", bold: true, italic: true },
        ],
      ]),
    ).toBe("hello **brave** new ***world***");
  });

  it("keeps whitespace outside of markers", () => {
    expect(runsToMarkdown([[{ text: " spaced ", bold: true, italic: false }]])).toBe(
      " **spaced** ",
    );
  });

  it("leaves whitespace-only runs unwrapped", () => {
    expect(runsToMarkdown([[{ text: "  ", bold: true, italic: false }]])).toBe("  ");
  });

  it("escapes literal markers typed by the author", () => {
    expect(runsToMarkdown([[{ text: "5 * 6", bold: false, italic: false }]])).toBe("5 \\* 6");
  });

  it("joins paragraphs with newlines", () => {
    expect(
      runsToMarkdown([
        [{ text: "first", bold: false, italic: false }],
        [],
        [{ text: "third", bold: false, italic: false }],
      ]),
    ).toBe("first\n\nthird");
  });

  it("round-trips parsed markdown", () => {
    expect(normalizeRichText("a **b** *c* ***d***\n\ne")).toBe("a **b** *c* ***d***\n\ne");
  });
});

describe("toggleRichTextStyle", () => {
  it("adds bold to an unstyled selection", () => {
    expect(toggleRichTextStyle("hello world", 6, 11, "bold")).toEqual({
      text: "hello **world**",
      selectionStart: 6,
      selectionEnd: 11,
    });
  });

  it("removes bold when the whole selection is already bold", () => {
    expect(toggleRichTextStyle("hello **world**", 6, 11, "bold")).toEqual({
      text: "hello world",
      selectionStart: 6,
      selectionEnd: 11,
    });
  });

  it("adds italic across a partially styled selection", () => {
    expect(toggleRichTextStyle("*ab*cd", 0, 4, "italic")).toEqual({
      text: "*abcd*",
      selectionStart: 0,
      selectionEnd: 4,
    });
  });

  it("keeps bold and italic independent", () => {
    expect(toggleRichTextStyle("**bold**", 0, 4, "italic")).toEqual({
      text: "***bold***",
      selectionStart: 0,
      selectionEnd: 4,
    });
  });

  it("spans paragraph boundaries without styling the newline", () => {
    expect(toggleRichTextStyle("ab\ncd", 0, 5, "bold")).toEqual({
      text: "**ab**\n**cd**",
      selectionStart: 0,
      selectionEnd: 5,
    });
  });

  it("inserts styled placeholder text for a collapsed selection", () => {
    expect(toggleRichTextStyle("hi ", 3, 3, "bold")).toEqual({
      text: "hi **text**",
      selectionStart: 3,
      selectionEnd: 7,
    });
  });

  it("clamps out-of-range offsets", () => {
    expect(toggleRichTextStyle("hi", -4, 40, "bold")).toEqual({
      text: "**hi**",
      selectionStart: 0,
      selectionEnd: 2,
    });
  });
});

describe("replaceRichTextRange", () => {
  it("inserts plain text at the caret", () => {
    expect(replaceRichTextRange("hello world", 5, 5, " brave")).toEqual({
      text: "hello brave world",
      selectionStart: 11,
      selectionEnd: 11,
    });
  });

  it("replaces the selected range and inherits the preceding style", () => {
    expect(replaceRichTextRange("**bold**", 4, 4, "er")).toEqual({
      text: "**bolder**",
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  it("normalizes pasted line endings", () => {
    expect(replaceRichTextRange("", 0, 0, "a\r\nb")).toEqual({
      text: "a\nb",
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it("escapes pasted markdown markers", () => {
    expect(replaceRichTextRange("", 0, 0, "**not bold**")).toEqual({
      text: "\\*\\*not bold\\*\\*",
      selectionStart: 12,
      selectionEnd: 12,
    });
  });
});
