import type { PageDropPosition } from "./bookEditorTypes";

export function orderPageIds(orderedPageIds: string[], pageIds: readonly string[]): string[] {
  const requested = new Set(pageIds);

  return orderedPageIds.filter((pageId) => requested.has(pageId));
}

export function movePageIds(
  orderedPageIds: string[],
  movingPageIds: readonly string[],
  targetPageId: string,
  position: PageDropPosition,
): string[] | null {
  const movedPageIds = orderPageIds(orderedPageIds, movingPageIds);

  if (movedPageIds.length === 0 || movedPageIds.includes(targetPageId)) {
    return null;
  }

  if (!orderedPageIds.includes(targetPageId)) {
    return null;
  }

  const remainingPageIds = orderedPageIds.filter((pageId) => !movedPageIds.includes(pageId));
  const insertionIndex = remainingPageIds.indexOf(targetPageId) + (position === "after" ? 1 : 0);
  const nextPageIds = [...remainingPageIds];

  nextPageIds.splice(insertionIndex, 0, ...movedPageIds);

  if (nextPageIds.every((pageId, index) => pageId === orderedPageIds[index])) {
    return null;
  }

  return nextPageIds;
}

export function getPageIdRange(
  orderedPageIds: string[],
  anchorPageId: string,
  focusPageId: string,
): string[] {
  const anchorIndex = orderedPageIds.indexOf(anchorPageId);
  const focusIndex = orderedPageIds.indexOf(focusPageId);

  if (anchorIndex < 0 || focusIndex < 0) {
    return focusIndex < 0 ? [] : [focusPageId];
  }

  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);

  return orderedPageIds.slice(start, end + 1);
}

export function togglePageId(
  orderedPageIds: string[],
  selectedPageIds: readonly string[],
  pageId: string,
): string[] {
  const nextPageIds = selectedPageIds.includes(pageId)
    ? selectedPageIds.filter((selectedPageId) => selectedPageId !== pageId)
    : [...selectedPageIds, pageId];

  return orderPageIds(orderedPageIds, nextPageIds);
}
