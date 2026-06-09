const storageKey = "scrapbook:sticker-usage";

type UsageMap = Record<string, number>;

const readStorage = (): UsageMap => {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: UsageMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
};

const writeStorage = (map: UsageMap) => {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(map));
  } catch {
    // Storage may be unavailable (private mode, quota); ignore.
  }
};

const listeners = new Set<(map: UsageMap) => void>();
let cache: UsageMap | null = null;

const getCache = (): UsageMap => {
  if (cache === null) cache = readStorage();
  return cache;
};

export const getStickerUsage = (): UsageMap => ({ ...getCache() });

export const recordStickerUsage = (stickerId: string): void => {
  const next = { ...getCache(), [stickerId]: Date.now() };
  cache = next;
  writeStorage(next);
  for (const listener of listeners) listener(next);
};

export const subscribeStickerUsage = (listener: (map: UsageMap) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
