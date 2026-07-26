import { describe, expect, it } from "vitest";

import {
  annotateInlineMarkdown,
  parseInlineRuns,
  parseRichText,
  replaceTextRange,
  toggleMarkdownStyle,
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

describe("annotateInlineMarkdown", () => {
  const cover = (line: string) => {
    const spans = annotateInlineMarkdown(line);
    let cursor = 0;
    for (const span of spans) {
      expect(span.start).toBe(cursor);
      expect(span.end).toBeGreaterThan(span.start);
      cursor = span.end;
    }
    expect(cursor).toBe(line.length);
    return spans;
  };

  it("returns nothing for an empty line", () => {
    expect(annotateInlineMarkdown("")).toEqual([]);
  });

  it("returns a single plain span for unstyled text", () => {
    expect(cover("hello world")).toEqual([
      { start: 0, end: 11, bold: false, italic: false, marker: false },
    ]);
  });

  it("marks bold markers separately from bold content", () => {
    expect(cover("a **b** c")).toEqual([
      { start: 0, end: 2, bold: false, italic: false, marker: false },
      { start: 2, end: 4, bold: true, italic: false, marker: true },
      { start: 4, end: 5, bold: true, italic: false, marker: false },
      { start: 5, end: 7, bold: true, italic: false, marker: true },
      { start: 7, end: 9, bold: false, italic: false, marker: false },
    ]);
  });

  it("marks italic markers", () => {
    expect(cover("*i*")).toEqual([
      { start: 0, end: 1, bold: false, italic: true, marker: true },
      { start: 1, end: 2, bold: false, italic: true, marker: false },
      { start: 2, end: 3, bold: false, italic: true, marker: true },
    ]);
  });

  it("handles bold and italic together", () => {
    const spans = cover("***bi***");
    expect(spans.at(0)).toEqual({ start: 0, end: 1, bold: false, italic: true, marker: true });
    expect(spans.some((span) => !span.marker && span.bold && span.italic)).toBe(true);
  });

  it("supports underscore markers", () => {
    expect(cover("__b__").filter((span) => span.marker)).toHaveLength(2);
    expect(cover("_i_").filter((span) => span.marker)).toHaveLength(2);
  });

  it("keeps unmatched markers unstyled", () => {
    expect(cover("**oops")).toEqual([
      { start: 0, end: 6, bold: false, italic: false, marker: false },
    ]);
  });

  it("covers escaped markers", () => {
    const spans = cover("a \\*b\\* c");
    expect(spans.every((span) => !span.bold && !span.italic)).toBe(true);
  });

  it("covers links without splitting their source", () => {
    const spans = cover("see [docs](https://example.com) now");
    expect(spans.every((span) => !span.marker)).toBe(true);
  });
});

describe("toggleMarkdownStyle", () => {
  it("wraps the selection in bold markers", () => {
    expect(toggleMarkdownStyle("hello world", 6, 11, "bold")).toEqual({
      text: "hello **world**",
      selectionStart: 8,
      selectionEnd: 13,
    });
  });

  it("wraps the selection in italic markers", () => {
    expect(toggleMarkdownStyle("hello world", 0, 5, "italic")).toEqual({
      text: "*hello* world",
      selectionStart: 1,
      selectionEnd: 6,
    });
  });

  it("removes existing bold markers", () => {
    expect(toggleMarkdownStyle("hello **world**", 8, 13, "bold")).toEqual({
      text: "hello world",
      selectionStart: 6,
      selectionEnd: 11,
    });
  });

  it("removes bold markers when the selection includes them", () => {
    expect(toggleMarkdownStyle("**world**", 0, 9, "bold")).toEqual({
      text: "world",
      selectionStart: 0,
      selectionEnd: 5,
    });
  });

  it("keeps italic when removing bold from combined emphasis", () => {
    expect(toggleMarkdownStyle("***x***", 3, 4, "bold").text).toBe("*x*");
  });

  it("adds italic to already bold text", () => {
    expect(toggleMarkdownStyle("**x**", 2, 3, "italic").text).toBe("***x***");
  });

  it("inserts empty markers for a collapsed selection", () => {
    expect(toggleMarkdownStyle("ab", 1, 1, "bold")).toEqual({
      text: "a****b",
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it("applies per line for multi-line selections", () => {
    expect(toggleMarkdownStyle("one\ntwo", 0, 7, "bold")).toEqual({
      text: "**one**\n**two**",
      selectionStart: 2,
      selectionEnd: 13,
    });
  });
});

describe("replaceTextRange", () => {
  it("replaces the selected range and moves the caret", () => {
    expect(replaceTextRange("hello world", 6, 11, "there")).toEqual({
      text: "hello there",
      selectionStart: 11,
      selectionEnd: 11,
    });
  });

  it("normalizes CRLF in inserted text", () => {
    expect(replaceTextRange("ab", 2, 2, "\r\nc").text).toBe("ab\nc");
  });

  it("clamps out-of-range offsets", () => {
    expect(replaceTextRange("ab", -5, 99, "z").text).toBe("z");
  });
});
