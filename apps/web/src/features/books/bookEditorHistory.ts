import { useCallback, useRef, useState } from "react";

import type { PageDetail } from "../../types";

export type BookEditorHistoryEntry = {
  activePageId: string | null;
  editingPageId: string | null;
  pageDetails: Map<string, PageDetail>;
  selectedLayerIds: string[];
};

export type EditHistoryMode = "group" | "record";

type BookEditorHistoryState<Entry> = {
  redoStack: Entry[];
  undoStack: Entry[];
};

type BookEditorHistoryChange<Entry> = {
  applyEntry: (entry: Entry) => void;
  createEntry: () => Entry;
};

const bookEditorHistoryLimit = 100;

const createEmptyHistory = <Entry>(): BookEditorHistoryState<Entry> => ({
  redoStack: [],
  undoStack: [],
});

export const getChangedPageIds = (
  previousDetails: Map<string, PageDetail>,
  nextDetails: Map<string, PageDetail>,
): string[] => {
  const pageIds = new Set([...previousDetails.keys(), ...nextDetails.keys()]);

  return [...pageIds].filter((pageId) => previousDetails.get(pageId) !== nextDetails.get(pageId));
};

export function useBookEditorHistory<Entry>() {
  const [history, setHistory] = useState<BookEditorHistoryState<Entry>>(() => createEmptyHistory());
  const pendingHistoryEntryRef = useRef<Entry | null>(null);

  const resetHistory = useCallback(() => {
    pendingHistoryEntryRef.current = null;
    setHistory(createEmptyHistory());
  }, []);

  const pushHistoryEntry = useCallback((entry: Entry) => {
    setHistory((currentHistory) => ({
      redoStack: [],
      undoStack: [...currentHistory.undoStack, entry].slice(-bookEditorHistoryLimit),
    }));
  }, []);

  const recordHistory = useCallback(
    (createEntry: () => Entry, historyMode: EditHistoryMode = "record") => {
      if (pendingHistoryEntryRef.current) {
        return;
      }

      const entry = createEntry();

      if (historyMode === "group") {
        pendingHistoryEntryRef.current = entry;
      }

      pushHistoryEntry(entry);
    },
    [pushHistoryEntry],
  );

  const endHistoryGroup = useCallback(() => {
    pendingHistoryEntryRef.current = null;
  }, []);

  const undoHistory = useCallback(
    ({ applyEntry, createEntry }: BookEditorHistoryChange<Entry>) => {
      const undoEntry = history.undoStack.at(-1);

      if (!undoEntry) {
        return;
      }

      const redoEntry = createEntry();
      pendingHistoryEntryRef.current = null;

      setHistory((currentHistory) => ({
        redoStack: [...currentHistory.redoStack, redoEntry].slice(-bookEditorHistoryLimit),
        undoStack: currentHistory.undoStack.slice(0, -1),
      }));
      applyEntry(undoEntry);
    },
    [history.undoStack],
  );

  const redoHistory = useCallback(
    ({ applyEntry, createEntry }: BookEditorHistoryChange<Entry>) => {
      const redoEntry = history.redoStack.at(-1);

      if (!redoEntry) {
        return;
      }

      const undoEntry = createEntry();
      pendingHistoryEntryRef.current = null;

      setHistory((currentHistory) => ({
        redoStack: currentHistory.redoStack.slice(0, -1),
        undoStack: [...currentHistory.undoStack, undoEntry].slice(-bookEditorHistoryLimit),
      }));
      applyEntry(redoEntry);
    },
    [history.redoStack],
  );

  return {
    endHistoryGroup,
    recordHistory,
    redoHistory,
    resetHistory,
    undoHistory,
  };
}
