import { annotateInlineMarkdown } from "@zakka/editor-core";

export type RichTextSelection = {
  start: number;
  end: number;
};

export const richTextLineClassName = "rich-text-line";

const blockTagNames = new Set(["DIV", "P", "LI", "SECTION", "ARTICLE", "BLOCKQUOTE", "PRE"]);

type TextSink = {
  chunks: string[];
  pendingBreaks: number;
  started: boolean;
};

const flushBreaks = (sink: TextSink): void => {
  for (let index = 0; index < sink.pendingBreaks; index += 1) sink.chunks.push("\n");
  sink.pendingBreaks = 0;
};

// Browsers keep a trailing <br> inside an otherwise empty block so the caret has
// somewhere to live; that filler must not be read back as a line break.
const isFillerBreak = (element: Element): boolean =>
  element.parentElement !== null && element.parentElement.childNodes.length === 1;

const walkNode = (node: Node, sink: TextSink): void => {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child as Text).data;
      if (text.length === 0) continue;
      flushBreaks(sink);
      sink.chunks.push(text);
      sink.started = true;
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    if (element.tagName === "BR") {
      if (!isFillerBreak(element)) {
        sink.pendingBreaks += 1;
        sink.started = true;
      }
      continue;
    }

    const isBlock = blockTagNames.has(element.tagName);
    if (isBlock && sink.started) sink.pendingBreaks += 1;
    walkNode(element, sink);
    if (isBlock) sink.started = true;
  }
};

/** Reads the contentEditable back as the markdown source it renders. */
export const readMarkdownSource = (root: HTMLElement): string => {
  const sink: TextSink = { chunks: [], pendingBreaks: 0, started: false };
  walkNode(root, sink);
  // Trailing breaks have no text after them to trigger a flush, but an empty
  // last line is still a line the caret can sit on.
  flushBreaks(sink);

  return sink.chunks.join("");
};

export const getMarkdownSourceLength = (root: HTMLElement): number =>
  readMarkdownSource(root).length;

const createLineElement = (document: Document, line: string): HTMLElement => {
  const element = document.createElement("div");
  element.className = richTextLineClassName;

  const spans = annotateInlineMarkdown(line);
  if (spans.length === 0) {
    element.append(document.createElement("br"));
    return element;
  }

  for (const span of spans) {
    const node = document.createElement("span");
    const classNames = ["rich-text-span"];
    if (span.bold) classNames.push("rich-text-bold");
    if (span.italic) classNames.push("rich-text-italic");
    if (span.marker) classNames.push("rich-text-marker");
    node.className = classNames.join(" ");
    node.textContent = line.slice(span.start, span.end);
    element.append(node);
  }

  return element;
};

/**
 * Renders the markdown source verbatim, wrapping each character range in a span
 * that previews the styling. DOM text stays identical to the source so caret
 * offsets need no translation.
 */
export const renderMarkdownSource = (root: HTMLElement, text: string): void => {
  const lines = text.split("\n");
  const document = root.ownerDocument;
  root.replaceChildren(...lines.map((line) => createLineElement(document, line)));
};

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

const offsetWithinLine = (line: LineMeasurement, node: Node, offset: number): number => {
  if (node.nodeType === Node.TEXT_NODE) {
    let total = 0;
    for (const textNode of line.textNodes) {
      if (textNode === node) return total + Math.min(Math.max(offset, 0), textNode.data.length);
      total += textNode.data.length;
    }

    return line.length;
  }

  // An element point sits before child `offset`; count every text node that
  // ends before it. Walking the line's own text nodes keeps this proportional
  // to the current line rather than the whole document.
  const boundary = node.childNodes[offset] ?? null;
  let total = 0;
  for (const textNode of line.textNodes) {
    const position = boundary
      ? boundary.compareDocumentPosition(textNode)
      : node.compareDocumentPosition(textNode);
    const mask = boundary
      ? Node.DOCUMENT_POSITION_PRECEDING
      : Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_CONTAINED_BY;
    if ((position & mask) === 0) break;
    total += textNode.data.length;
  }

  return Math.min(total, line.length);
};

const offsetForPoint = (
  root: HTMLElement,
  lines: readonly LineMeasurement[],
  node: Node,
  offset: number,
): number => {
  const lastLine = lines[lines.length - 1];
  if (!lastLine) return 0;

  if (node === root) {
    const line = lines[Math.min(Math.max(offset, 0), lines.length - 1)];
    if (!line) return 0;

    return offset >= lines.length ? lastLine.start + lastLine.length : line.start;
  }

  const line = lines.find(({ element }) => element === node || element.contains(node));
  if (!line) return lastLine.start + lastLine.length;

  return line.start + offsetWithinLine(line, node, offset);
};

export const readMarkdownSelection = (root: HTMLElement): RichTextSelection | null => {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const lines = measureLines(root);

  return {
    start: offsetForPoint(root, lines, range.startContainer, range.startOffset),
    end: offsetForPoint(root, lines, range.endContainer, range.endOffset),
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

export const applyMarkdownSelection = (
  root: HTMLElement,
  markdownSelection: RichTextSelection,
): void => {
  const lines = measureLines(root);
  const start = locatePoint(lines, markdownSelection.start);
  const end = locatePoint(lines, markdownSelection.end);
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
