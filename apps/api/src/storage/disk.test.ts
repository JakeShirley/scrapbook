import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDiskStorage, UnsafeStorageKeyError } from "./disk.js";

const tempDirs: string[] = [];

const createTempRoot = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "scrapbook-storage-"));
  tempDirs.push(rootDir);

  return rootDir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("DiskStorage", () => {
  it("stores and reads opaque keys below the configured root", async () => {
    const storage = createDiskStorage({ rootDir: await createTempRoot() });
    await storage.ensureReady();

    const stored = await storage.write("uploads", Buffer.from("image-bytes"), {
      extension: ".jpg",
    });

    expect(stored.key).toMatch(/^uploads\/[a-f0-9]{2}\/[a-f0-9-]+\.jpg$/);
    expect(stored.byteSize).toBe(11);
    await expect(storage.read(stored.key)).resolves.toEqual(Buffer.from("image-bytes"));

    await storage.remove(stored.key);
    await expect(storage.read(stored.key)).rejects.toThrow();
  });

  it("rejects traversal and absolute storage keys", async () => {
    const storage = createDiskStorage({ rootDir: await createTempRoot() });

    await expect(storage.read("../secret.txt")).rejects.toThrow(UnsafeStorageKeyError);
    await expect(storage.read("/tmp/secret.txt")).rejects.toThrow(UnsafeStorageKeyError);
    await expect(storage.read("uploads/../../secret.txt")).rejects.toThrow(UnsafeStorageKeyError);
    await expect(storage.read("unknown/aa/file.jpg")).rejects.toThrow(UnsafeStorageKeyError);
  });
});
