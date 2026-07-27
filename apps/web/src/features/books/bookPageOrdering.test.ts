import { describe, expect, it } from "vitest";

import { getPageIdRange, movePageIds, orderPageIds, togglePageId } from "./bookPageOrdering";

const pages = ["a", "b", "c", "d", "e"];

describe("movePageIds", () => {
  it("moves a single page before a target page", () => {
    expect(movePageIds(pages, ["d"], "b", "before")).toEqual(["a", "d", "b", "c", "e"]);
  });

  it("moves a single page after a target page", () => {
    expect(movePageIds(pages, ["a"], "c", "after")).toEqual(["b", "c", "a", "d", "e"]);
  });

  it("moves multiple pages together and keeps their book order", () => {
    expect(movePageIds(pages, ["d", "b"], "a", "before")).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("moves multiple pages after a target page", () => {
    expect(movePageIds(pages, ["a", "b"], "d", "after")).toEqual(["c", "d", "a", "b", "e"]);
  });

  it("moves a non-contiguous selection to the end", () => {
    expect(movePageIds(pages, ["a", "c"], "e", "after")).toEqual(["b", "d", "e", "a", "c"]);
  });

  it("ignores drops onto a page that is being moved", () => {
    expect(movePageIds(pages, ["b", "c"], "c", "before")).toBeNull();
  });

  it("ignores unknown pages", () => {
    expect(movePageIds(pages, ["z"], "b", "before")).toBeNull();
    expect(movePageIds(pages, ["a"], "z", "before")).toBeNull();
  });

  it("returns null when the order does not change", () => {
    expect(movePageIds(pages, ["b"], "a", "after")).toBeNull();
    expect(movePageIds(pages, ["a", "b"], "c", "before")).toBeNull();
  });
});

describe("getPageIdRange", () => {
  it("returns an inclusive range in either direction", () => {
    expect(getPageIdRange(pages, "b", "d")).toEqual(["b", "c", "d"]);
    expect(getPageIdRange(pages, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("falls back to the focused page when the anchor is unknown", () => {
    expect(getPageIdRange(pages, "z", "c")).toEqual(["c"]);
  });
});

describe("togglePageId", () => {
  it("adds pages in book order", () => {
    expect(togglePageId(pages, ["d"], "b")).toEqual(["b", "d"]);
  });

  it("removes pages that are already selected", () => {
    expect(togglePageId(pages, ["b", "d"], "d")).toEqual(["b"]);
  });
});

describe("orderPageIds", () => {
  it("sorts and de-duplicates selections by book order", () => {
    expect(orderPageIds(pages, ["e", "a", "a"])).toEqual(["a", "e"]);
  });
});
