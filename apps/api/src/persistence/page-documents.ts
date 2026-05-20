import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

export type PageDocumentStore = {
  createKey: (input: { accountId: string; pageId: string }) => string;
  read: (key: string) => string | null;
  remove: (key: string) => void;
  write: (key: string, documentJson: string, options?: { overwrite?: boolean }) => void;
};

export class UnsafePageDocumentKeyError extends Error {
  constructor(key: string) {
    super(`Unsafe page document key: ${key}`);
    this.name = "UnsafePageDocumentKeyError";
  }
}

const safeEntityIdPattern = /^[a-z]+_[a-z0-9_-]+$/i;
const pageDocumentRoot = "documents";

const assertSafeEntityId = (id: string): void => {
  if (!safeEntityIdPattern.test(id)) {
    throw new UnsafePageDocumentKeyError(id);
  }
};

export const createPageDocumentKey = (input: { accountId: string; pageId: string }): string => {
  assertSafeEntityId(input.accountId);
  assertSafeEntityId(input.pageId);

  return `${pageDocumentRoot}/accounts/${input.accountId}/pages/${input.pageId}/document.json`;
};

export class DiskPageDocumentStore implements PageDocumentStore {
  readonly rootDir: string;

  constructor(options: { rootDir: string }) {
    this.rootDir = resolve(options.rootDir);
  }

  ensureReady(): void {
    mkdirSync(resolve(this.rootDir, pageDocumentRoot), { recursive: true });
  }

  createKey(input: { accountId: string; pageId: string }): string {
    return createPageDocumentKey(input);
  }

  read(key: string): string | null {
    const path = this.resolveKey(key);

    if (!existsSync(path)) {
      return null;
    }

    return readFileSync(path, "utf8");
  }

  remove(key: string): void {
    rmSync(this.resolveKey(key), { force: true });
  }

  write(key: string, documentJson: string, options: { overwrite?: boolean } = {}): void {
    const destination = this.resolveKey(key);
    const overwrite = options.overwrite ?? true;

    mkdirSync(dirname(destination), { recursive: true });

    if (!overwrite) {
      writeFileSync(destination, documentJson, { encoding: "utf8", flag: "wx" });
      return;
    }

    const tempPath = resolve(dirname(destination), `.document-${randomUUID()}.tmp`);

    try {
      writeFileSync(tempPath, documentJson, "utf8");
      renameSync(tempPath, destination);
    } catch (error) {
      rmSync(tempPath, { force: true });
      throw error;
    }
  }

  private resolveKey(key: string): string {
    const parts = key.split("/");

    if (
      key.length === 0 ||
      key.includes("\\") ||
      key.startsWith("/") ||
      parts.some((part) => part.length === 0 || part === "." || part === "..") ||
      parts[0] !== pageDocumentRoot ||
      !/^[a-z0-9][a-z0-9/_\-.]*$/i.test(key)
    ) {
      throw new UnsafePageDocumentKeyError(key);
    }

    const absolutePath = resolve(this.rootDir, key);

    if (absolutePath !== this.rootDir && !absolutePath.startsWith(`${this.rootDir}${sep}`)) {
      throw new UnsafePageDocumentKeyError(key);
    }

    return absolutePath;
  }
}

export class MemoryPageDocumentStore implements PageDocumentStore {
  private readonly documents = new Map<string, string>();

  createKey(input: { accountId: string; pageId: string }): string {
    return createPageDocumentKey(input);
  }

  read(key: string): string | null {
    return this.documents.get(key) ?? null;
  }

  remove(key: string): void {
    this.documents.delete(key);
  }

  write(key: string, documentJson: string, options: { overwrite?: boolean } = {}): void {
    if (options.overwrite === false && this.documents.has(key)) {
      throw new Error(`Page document already exists: ${key}`);
    }

    this.documents.set(key, documentJson);
  }
}

export const createPageDocumentStore = (options: { rootDir: string }): DiskPageDocumentStore => {
  const store = new DiskPageDocumentStore(options);
  store.ensureReady();

  return store;
};

export const createMemoryPageDocumentStore = (): MemoryPageDocumentStore =>
  new MemoryPageDocumentStore();
