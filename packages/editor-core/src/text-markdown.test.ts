import { describe, expect, it } from "vitest";

import { parseInlineRuns, parseRichText } from "./text-markdown.js";

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
