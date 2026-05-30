export const createClientId = (): string => {
  try {
    const randomUuid = globalThis.crypto?.randomUUID?.() ?? null;

    if (randomUuid) {
      return randomUuid;
    }
  } catch {}

  const bytes = new Uint8Array(16);
  let hasRandomBytes = false;

  try {
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
      hasRandomBytes = true;
    }
  } catch {
    hasRandomBytes = false;
  }

  if (hasRandomBytes) {
    bytes[6] = ((bytes.at(6) ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes.at(8) ?? 0) & 0x3f) | 0x80;

    const hexBytes = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

    return `${hexBytes.slice(0, 4).join("")}-${hexBytes.slice(4, 6).join("")}-${hexBytes
      .slice(6, 8)
      .join("")}-${hexBytes.slice(8, 10).join("")}-${hexBytes.slice(10, 16).join("")}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};
