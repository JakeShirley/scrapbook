import type { RichTextParagraph, RichTextRun } from "@zakka/editor-core";

export type RichTextSelection = {
  start: number;
  end: number;
};

export const richTextLineClassName = "rich-text-line";

const blockTagNames = new Set(["DIV", "P", "LI", "SECTION", "ARTICLE", "BLOCKQUOTE", "PRE"]);
const boldTagNames = new Set(["STRONG", "B"]);
const italicTagNames = new Set(["EM", "I"]);

type ParagraphSink = {
  paragraphs: RichTextRun[][];
  pendingBreaks: number;
  started: boolean;
};

const appendRun = (runs: RichTextRun[], text: string, bold: boolean, italic: boolean): void => {
  const previous = runs[runs.length - 1];
  if (previous && previous.bold === bold && previous.italic === italic) {
    previous.text += text;
    return;
  }

  runs.push({ text, bold, italic });
};

const flushBreaks = (sink: ParagraphSink): void => {
  for (let index = 0; index < sink.pendingBreaks; index += 1) {
    sink.paragraphs.push([]);
  }
  sink.pendingBreaks = 0;
};

const pushText = (sink: ParagraphSink, text: string, bold: boolean, italic: boolean): void => {
  if (text.length === 0) return;

  flushBreaks(sink);
  const current = sink.paragraphs[sink.paragraphs.length - 1];
  if (current) appendRun(current, text, bold, italic);
  sink.started = true;
};

const pushBreak = (sink: ParagraphSink): void => {
  sink.pendingBreaks += 1;
  sink.started = true;
};

// Browsers keep a trailing <br> inside an otherwise empty block so the caret has
// somewhere to live; that filler must not be read back as a line break.
const isFillerBreak = (element: Element): boolean =>
  element.parentElement !== null && element.parentElement.childNodes.length === 1;

const walkNode = (node: Node, bold: boolean, italic: boolean, sink: ParagraphSink): void => {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      pushText(sink, (child as Text).data, bold, italic);
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    const tagName = element.tagName;

    if (tagName === "BR") {
      if (!isFillerBreak(element)) pushBreak(sink);
      continue;
    }

    const isBlock = blockTagNames.has(tagName);
    if (isBlock && sink.started) sink.pendingBreaks += 1;

    walkNode(
      element,
      bold || boldTagNames.has(tagName),
      italic || italicTagNames.has(tagName),
      sink,
    );

    if (isBlock) sink.started = true;
  }
};

export const readRichTextParagraphs = (root: HTMLElement): RichTextParagraph[] => {
  const sink: ParagraphSink = { paragraphs: [[]], pendingBreaks: 0, started: false };
  walkNode(root, false, false, sink);
  flushBreaks(sink);

  return sink.paragraphs;
};

const createRunNode = (document: Document, run: RichTextRun): Node => {
  let node: Node = document.createTextNode(run.text);
  if (run.italic) {
    const emphasis = document.createElement("em");
    emphasis.append(node);
    node = emphasis;
  }
  if (run.bold) {
    const strong = document.createElement("strong");
    strong.append(node);
    node = strong;
  }

  return node;
};

const createLineElement = (document: Document, runs: RichTextParagraph): HTMLElement => {
  const line = document.createElement("div");
  line.className = richTextLineClassName;
  let hasContent = false;
  for (const run of runs) {
    if (run.text.length === 0) continue;
    line.append(createRunNode(document, run));
    hasContent = true;
  }
  if (!hasContent) line.append(document.createElement("br"));

  return line;
};

export const renderRichTextParagraphs = (
  root: HTMLElement,
  paragraphs: readonly RichTextParagraph[],
): void => {
  const lines = paragraphs.length > 0 ? paragraphs : [[]];
  const document = root.ownerDocument;
  root.replaceChildren(...lines.map((runs) => createLineElement(document, runs)));
};

const plainLengthOfParagraphs = (paragraphs: readonly RichTextParagraph[]): number =>
  paragraphs.reduce(
    (total, runs, index) =>
      total + (index > 0 ? 1 : 0) + runs.reduce((sum, run) => sum + run.text.length, 0),
    0,
  );

const collectTextNodes = (element: Element): Text[] => {
  const textNodes: Text[] = [];
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  return textNodes;
};

type LineMeasurement = {
  element: Element;
  textNodes: Text[];
  start: number;
  length: number;
};

const measureLines = (root: HTMLElement): LineMeasurement[] => {
  const measurements: LineMeasurement[] = [];
  let offset = 0;
  Array.from(root.children).forEach((element, index) => {
    if (index > 0) offset += 1;
    const textNodes = collectTextNodes(element);
    const length = textNodes.reduce((total, node) => total + node.data.length, 0);
    measurements.push({ element, textNodes, start: offset, length });
    offset += length;
  });

  return measurements;
};

export const getRichTextLength = (root: HTMLElement): number =>
  plainLengthOfParagraphs(readRichTextParagraphs(root));

const offsetForPoint = (root: HTMLElement, node: Node, offset: number): number => {
  const document = root.ownerDocument;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  const holder = document.createElement("div");
  holder.append(range.cloneContents());

  return plainLengthOfParagraphs(readRichTextParagraphs(holder));
};

export const readRichTextSelection = (root: HTMLElement): RichTextSelection | null => {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  return {
    start: offsetForPoint(root, range.startContainer, range.startOffset),
    end: offsetForPoint(root, range.endContainer, range.endOffset),
  };
};

const locatePoint = (
  lines: readonly LineMeasurement[],
  target: number,
): { node: Node; offset: number } | null => {
  if (lines.length === 0) return null;

  let line = lines[0] as LineMeasurement;
  for (const candidate of lines) {
    if (candidate.start <= target) line = candidate;
  }

  let remaining = Math.min(Math.max(target - line.start, 0), line.length);
  for (const textNode of line.textNodes) {
    if (remaining <= textNode.data.length) return { node: textNode, offset: remaining };
    remaining -= textNode.data.length;
  }

  const lastTextNode = line.textNodes[line.textNodes.length - 1];
  if (lastTextNode) return { node: lastTextNode, offset: lastTextNode.data.length };

  return { node: line.element, offset: 0 };
};

export const applyRichTextSelection = (
  root: HTMLElement,
  richTextSelection: RichTextSelection,
): void => {
  const lines = measureLines(root);
  const start = locatePoint(lines, richTextSelection.start);
  const end = locatePoint(lines, richTextSelection.end);
  if (!start || !end) return;

  const document = root.ownerDocument;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const selection = document.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
};
