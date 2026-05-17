import { makeFixedClock } from "@scrapbook/test-utils";
import { describe, expect, it } from "vitest";

import { createDatabaseConnection } from "./database.js";
import { runMigrations } from "./migrations.js";
import { createRepositories, OwnershipError } from "./repositories.js";

const createTestRepositories = () => {
  const connection = createDatabaseConnection({ databasePath: ":memory:" });
  runMigrations(connection.sqlite);

  return {
    connection,
    repositories: createRepositories(connection.db, { clock: makeFixedClock() }),
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
      const book = repositories.books.create({ accountId: account.id, title: "Family book" });
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
});
