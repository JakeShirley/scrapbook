import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeFixedClock } from "@zakka/test-utils";
import { describe, expect, it } from "vitest";

import { createDatabaseConnection } from "./database.js";
import { runMigrations } from "./migrations.js";
import { createPageDocumentStore } from "./page-documents.js";
import { createRepositories, OwnershipError } from "./repositories.js";

const createTestRepositories = (options: { fileBackedPageDocuments?: boolean } = {}) => {
  const connection = createDatabaseConnection({ databasePath: ":memory:" });
  const rootDir = options.fileBackedPageDocuments
    ? mkdtempSync(join(tmpdir(), "scrapbook-repositories-"))
    : null;
  const pageDocuments = rootDir ? createPageDocumentStore({ rootDir }) : undefined;

  runMigrations(connection.sqlite);

  return {
    connection,
    repositories: createRepositories(connection.db, {
      clock: makeFixedClock(),
      ...(pageDocuments ? { pageDocuments } : {}),
    }),
    rootDir,
  };
};

describe("repositories", () => {
  it("persists account-owned records through typed repositories", () => {
    const { connection, repositories } = createTestRepositories();

    try {
      const account = repositories.accounts.create({
        displayName: "Ada Lovelace",
        primaryEmail: "ada@example.com",
      });
      const identity = repositories.authIdentities.create({
        accountId: account.id,
        provider: "email_password",
        providerSubject: "ada@example.com",
        passwordHash: "argon2id-placeholder",
      });
      const session = repositories.sessions.create({
        accountId: account.id,
        secretHash: "session-secret-hash",
        expiresAt: "2026-05-18T00:00:00.000Z",
      });
      const asset = repositories.assets.createOriginal({
        accountId: account.id,
        originalStorageKey: "uploads/aa/original.jpg",
        originalFilename: "original.jpg",
        mimeType: "image/jpeg",
        byteSize: 42,
        width: 100,
        height: 100,
        checksumSha256: "checksum",
      });
      const variant = repositories.assets.createVariant({
        accountId: account.id,
        assetId: asset.id,
        kind: "thumbnail",
        storageKey: "variants/bb/thumb.jpg",
        mimeType: "image/jpeg",
        byteSize: 20,
        checksumSha256: "variant-checksum",
      });
      const page = repositories.pages.create({
        accountId: account.id,
        title: "First page",
        width: 2400,
        height: 2400,
      });
      const book = repositories.books.create({
        accountId: account.id,
        pageWidth: 2400,
        pageHeight: 3000,
        title: "Family book",
      });
      const bookPage = repositories.books.addPage({
        accountId: account.id,
        bookId: book.id,
        pageId: page.id,
        sortOrder: 0,
      });
      const exportJob = repositories.exports.create({
        accountId: account.id,
        pageId: page.id,
        format: "png",
      });
      const bookExportJob = repositories.exports.create({
        accountId: account.id,
        bookId: book.id,
        format: "pdf",
      });

      expect(account.id).toMatch(/^account_/);
      expect(identity.id).toMatch(/^auth_identity_/);
      expect(session.id).toMatch(/^session_/);
      expect(asset.id).toMatch(/^asset_/);
      expect(variant.id).toMatch(/^asset_variant_/);
      expect(bookPage.id).toMatch(/^book_page_/);
      expect(exportJob.id).toMatch(/^export_/);
      expect(repositories.assets.listForAccount(account.id)).toHaveLength(1);
      expect(repositories.sessions.findActiveByIdForAccount(account.id, session.id)?.id).toBe(
        session.id,
      );
      expect(repositories.books.deleteByIdForAccount(account.id, book.id)).toBe(true);
      expect(repositories.books.findByIdForAccount(account.id, book.id)).toBeNull();
      expect(repositories.exports.findByIdForAccount(account.id, bookExportJob.id)).toBeNull();
      expect(repositories.exports.findByIdForAccount(account.id, exportJob.id)?.id).toBe(
        exportJob.id,
      );
    } finally {
      connection.close();
    }
  });

  it("rejects cross-account repository access", () => {
    const { connection, repositories } = createTestRepositories();

    try {
      const firstAccount = repositories.accounts.create({
        displayName: "First",
        primaryEmail: "first@example.com",
      });
      const secondAccount = repositories.accounts.create({
        displayName: "Second",
        primaryEmail: "second@example.com",
      });
      const firstAsset = repositories.assets.createOriginal({
        accountId: firstAccount.id,
        originalStorageKey: "uploads/aa/first.jpg",
        originalFilename: "first.jpg",
        mimeType: "image/jpeg",
        byteSize: 12,
        checksumSha256: "first-checksum",
      });
      const firstBook = repositories.books.create({
        accountId: firstAccount.id,
        pageWidth: 2400,
        pageHeight: 3000,
        title: "First book",
      });
      const secondPage = repositories.pages.create({
        accountId: secondAccount.id,
        title: "Second page",
        width: 2400,
        height: 2400,
      });

      expect(repositories.assets.findByIdForAccount(secondAccount.id, firstAsset.id)).toBeNull();
      expect(() =>
        repositories.assets.createVariant({
          accountId: secondAccount.id,
          assetId: firstAsset.id,
          kind: "thumbnail",
          storageKey: "variants/cc/cross-account.jpg",
          mimeType: "image/jpeg",
          byteSize: 8,
          checksumSha256: "cross-checksum",
        }),
      ).toThrow(OwnershipError);
      expect(() =>
        repositories.books.addPage({
          accountId: firstAccount.id,
          bookId: firstBook.id,
          pageId: secondPage.id,
          sortOrder: 0,
        }),
      ).toThrow(OwnershipError);
      expect(() =>
        repositories.exports.create({
          accountId: firstAccount.id,
          pageId: secondPage.id,
          format: "png",
        }),
      ).toThrow(OwnershipError);
    } finally {
      connection.close();
    }
  });

  it("stores page document JSON in loose files", () => {
    const { connection, repositories, rootDir } = createTestRepositories({
      fileBackedPageDocuments: true,
    });

    try {
      const account = repositories.accounts.create({
        displayName: "Ada Lovelace",
        primaryEmail: "ada-files@example.com",
      });
      const documentJson = JSON.stringify({
        canvas: { backgroundColor: "#ffffff", height: 2400, width: 2400 },
        layers: [],
        schemaVersion: 1,
      });
      const page = repositories.pages.create({
        accountId: account.id,
        documentJson,
        height: 2400,
        title: "Loose file page",
        width: 2400,
      });
      const row = connection.sqlite
        .prepare(
          "SELECT document_json, document_storage_key FROM pages WHERE id = ? AND account_id = ?",
        )
        .get(page.id, account.id) as { document_json: string; document_storage_key: string };
      const documentPath = join(rootDir ?? "", row.document_storage_key);

      expect(row.document_json).toBe("");
      expect(row.document_storage_key).toBe(
        `documents/accounts/${account.id}/pages/${page.id}/document.json`,
      );
      expect(JSON.parse(readFileSync(documentPath, "utf8"))).toMatchObject({
        canvas: { width: 2400 },
      });
      expect(repositories.pages.findByIdForAccount(account.id, page.id)?.documentJson).toBe(
        documentJson,
      );

      repositories.pages.deleteByIdForAccount(account.id, page.id);

      expect(existsSync(documentPath)).toBe(false);
    } finally {
      connection.close();

      if (rootDir) {
        rmSync(rootDir, { recursive: true, force: true });
      }
    }
  });

  it("manages albums and their photo memberships", () => {
    const { connection, repositories } = createTestRepositories();

    try {
      const account = repositories.accounts.create({
        displayName: "Ada",
        primaryEmail: "ada-albums@example.com",
      });
      const otherAccount = repositories.accounts.create({
        displayName: "Bob",
        primaryEmail: "bob-albums@example.com",
      });
      const photoOne = repositories.assets.createOriginal({
        accountId: account.id,
        originalStorageKey: "uploads/01.jpg",
        originalFilename: "01.jpg",
        mimeType: "image/jpeg",
        byteSize: 11,
        checksumSha256: "csum-01",
      });
      const photoTwo = repositories.assets.createOriginal({
        accountId: account.id,
        originalStorageKey: "uploads/02.jpg",
        originalFilename: "02.jpg",
        mimeType: "image/jpeg",
        byteSize: 12,
        checksumSha256: "csum-02",
      });
      const foreignPhoto = repositories.assets.createOriginal({
        accountId: otherAccount.id,
        originalStorageKey: "uploads/03.jpg",
        originalFilename: "03.jpg",
        mimeType: "image/jpeg",
        byteSize: 13,
        checksumSha256: "csum-03",
      });

      const album = repositories.albums.create({ accountId: account.id, title: "Japan 2024" });

      expect(album.id).toMatch(/^album_/);
      expect(repositories.albums.listForAccount(account.id)).toEqual([
        expect.objectContaining({ id: album.id, photoCount: 0, title: "Japan 2024" }),
      ]);

      repositories.albums.addAssetsToAlbum({
        accountId: account.id,
        albumId: album.id,
        assetIds: [photoOne.id, photoTwo.id, photoOne.id],
      });

      expect(
        repositories.albums.listAssetsForAlbum(account.id, album.id).map((asset) => asset.id),
      ).toEqual([photoTwo.id, photoOne.id]);
      expect(repositories.albums.listForAccount(account.id)[0]?.photoCount).toBe(2);

      // Adding an asset that already belongs to the album is a no-op.
      repositories.albums.addAssetsToAlbum({
        accountId: account.id,
        albumId: album.id,
        assetIds: [photoOne.id],
      });
      expect(repositories.albums.listAssetsForAlbum(account.id, album.id)).toHaveLength(2);

      expect(() =>
        repositories.albums.addAssetsToAlbum({
          accountId: account.id,
          albumId: album.id,
          assetIds: [foreignPhoto.id],
        }),
      ).toThrow(OwnershipError);

      expect(
        repositories.albums.removeAssetFromAlbum({
          accountId: account.id,
          albumId: album.id,
          assetId: photoOne.id,
        }),
      ).toBe(true);
      expect(repositories.albums.listAssetsForAlbum(account.id, album.id)).toHaveLength(1);

      // A photo can belong to multiple albums at once.
      const secondAlbum = repositories.albums.create({
        accountId: account.id,
        title: "Trip highlights",
      });
      repositories.albums.addAssetsToAlbum({
        accountId: account.id,
        albumId: secondAlbum.id,
        assetIds: [photoTwo.id],
      });

      const photoTwoAlbums = repositories.albums.listAlbumsForAsset(account.id, photoTwo.id);
      expect(photoTwoAlbums.map((entry) => entry.id).sort()).toEqual(
        [album.id, secondAlbum.id].sort(),
      );
      expect(photoTwoAlbums.every((entry) => entry.photoCount >= 1)).toBe(true);

      // listAlbumsForAsset is scoped to the account.
      expect(repositories.albums.listAlbumsForAsset(otherAccount.id, photoTwo.id)).toEqual([]);

      expect(
        repositories.albums.update({
          accountId: account.id,
          albumId: album.id,
          title: "Japan, fall 2024",
        })?.title,
      ).toBe("Japan, fall 2024");

      // Other accounts cannot touch this album.
      expect(repositories.albums.findByIdForAccount(otherAccount.id, album.id)).toBeNull();
      expect(() =>
        repositories.albums.removeAssetFromAlbum({
          accountId: otherAccount.id,
          albumId: album.id,
          assetId: photoTwo.id,
        }),
      ).toThrow(OwnershipError);

      expect(repositories.albums.delete({ accountId: account.id, albumId: album.id })).toBe(true);
      expect(repositories.albums.listForAccount(account.id).map((entry) => entry.id)).toEqual([
        secondAlbum.id,
      ]);
    } finally {
      connection.close();
    }
  });
});
