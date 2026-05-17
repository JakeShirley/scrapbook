import { createTimestamp, type ISODateTime } from "@scrapbook/domain";
import { createPageDocument } from "@scrapbook/editor-core";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";

import type { AppDatabase } from "./database.js";
import { createEntityId, createInternalId } from "./ids.js";
import {
  type AccountRecord,
  type AssetRecord,
  type AssetVariantKind,
  type AssetVariantRecord,
  type AuthIdentityProvider,
  type AuthIdentityRecord,
  accounts,
  assets,
  assetVariants,
  authIdentities,
  type BookPageRecord,
  type BookRecord,
  bookPages,
  books,
  type ExportFormat,
  type ExportJobRecord,
  type ExportPreset,
  exportJobs,
  type PageRecord,
  pages,
  type SessionRecord,
  sessions,
} from "./schema.js";

export type RepositoryClock = () => Date;

export class OwnershipError extends Error {
  constructor(message = "Resource does not belong to the account") {
    super(message);
    this.name = "OwnershipError";
  }
}

const defaultClock: RepositoryClock = () => new Date();

const now = (clock: RepositoryClock): ISODateTime => createTimestamp(clock());

export class AccountRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: RepositoryClock = defaultClock,
  ) {}

  create(input: { displayName: string; primaryEmail: string; id?: string }): AccountRecord {
    const timestamp = now(this.clock);
    const record: AccountRecord = {
      id: input.id ?? createEntityId("account"),
      displayName: input.displayName,
      primaryEmail: input.primaryEmail,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(accounts).values(record).run();

    return record;
  }

  findById(id: string): AccountRecord | null {
    return this.db.select().from(accounts).where(eq(accounts.id, id)).get() ?? null;
  }

  findByPrimaryEmail(primaryEmail: string): AccountRecord | null {
    return (
      this.db.select().from(accounts).where(eq(accounts.primaryEmail, primaryEmail)).get() ?? null
    );
  }
}

export class AuthIdentityRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: RepositoryClock = defaultClock,
  ) {}

  create(input: {
    accountId: string;
    provider: AuthIdentityProvider;
    providerSubject: string;
    passwordHash?: string | null;
    id?: string;
  }): AuthIdentityRecord {
    const timestamp = now(this.clock);
    const record: AuthIdentityRecord = {
      id: input.id ?? createInternalId("authIdentity"),
      accountId: input.accountId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      passwordHash: input.passwordHash ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(authIdentities).values(record).run();

    return record;
  }

  findByProviderSubject(
    provider: AuthIdentityProvider,
    providerSubject: string,
  ): AuthIdentityRecord | null {
    return (
      this.db
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, provider),
            eq(authIdentities.providerSubject, providerSubject),
          ),
        )
        .get() ?? null
    );
  }
}

export class SessionRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: RepositoryClock = defaultClock,
  ) {}

  create(input: {
    accountId: string;
    secretHash: string;
    expiresAt: ISODateTime;
    userAgent?: string | null;
    ipAddress?: string | null;
    id?: string;
  }): SessionRecord {
    const timestamp = now(this.clock);
    const record: SessionRecord = {
      id: input.id ?? createEntityId("session"),
      accountId: input.accountId,
      secretHash: input.secretHash,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(sessions).values(record).run();

    return record;
  }

  findActiveByIdForAccount(accountId: string, sessionId: string): SessionRecord | null {
    return (
      this.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.accountId, accountId),
            eq(sessions.id, sessionId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now(this.clock)),
          ),
        )
        .get() ?? null
    );
  }

  findActiveById(sessionId: string): SessionRecord | null {
    return (
      this.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.id, sessionId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now(this.clock)),
          ),
        )
        .get() ?? null
    );
  }

  revokeByIdForAccount(accountId: string, sessionId: string): void {
    const timestamp = now(this.clock);

    this.db
      .update(sessions)
      .set({ revokedAt: timestamp, updatedAt: timestamp })
      .where(
        and(
          eq(sessions.accountId, accountId),
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
        ),
      )
      .run();
  }
}

export class AssetRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: RepositoryClock = defaultClock,
  ) {}

  createOriginal(input: {
    accountId: string;
    originalStorageKey: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    checksumSha256: string;
    width?: number | null;
    height?: number | null;
    id?: string;
  }): AssetRecord {
    const timestamp = now(this.clock);
    const record: AssetRecord = {
      id: input.id ?? createEntityId("asset"),
      accountId: input.accountId,
      originalStorageKey: input.originalStorageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width ?? null,
      height: input.height ?? null,
      checksumSha256: input.checksumSha256,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(assets).values(record).run();

    return record;
  }

  createVariant(input: {
    accountId: string;
    assetId: string;
    kind: AssetVariantKind;
    storageKey: string;
    mimeType: string;
    byteSize: number;
    checksumSha256: string;
    width?: number | null;
    height?: number | null;
    id?: string;
  }): AssetVariantRecord {
    const owner = this.findByIdForAccount(input.accountId, input.assetId);

    if (!owner) {
      throw new OwnershipError("Asset variant cannot be attached across accounts");
    }

    const timestamp = now(this.clock);
    const record: AssetVariantRecord = {
      id: input.id ?? createInternalId("assetVariant"),
      accountId: input.accountId,
      assetId: input.assetId,
      kind: input.kind,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width ?? null,
      height: input.height ?? null,
      checksumSha256: input.checksumSha256,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(assetVariants).values(record).run();

    return record;
  }

  findByIdForAccount(accountId: string, assetId: string): AssetRecord | null {
    return (
      this.db
        .select()
        .from(assets)
        .where(and(eq(assets.accountId, accountId), eq(assets.id, assetId)))
        .get() ?? null
    );
  }

  findVariantByKindForAccount(
    accountId: string,
    assetId: string,
    kind: AssetVariantKind,
  ): AssetVariantRecord | null {
    return (
      this.db
        .select()
        .from(assetVariants)
        .where(
          and(
            eq(assetVariants.accountId, accountId),
            eq(assetVariants.assetId, assetId),
            eq(assetVariants.kind, kind),
          ),
        )
        .get() ?? null
    );
  }

  findVariantByIdForAccount(
    accountId: string,
    assetId: string,
    variantId: string,
  ): AssetVariantRecord | null {
    return (
      this.db
        .select()
        .from(assetVariants)
        .where(
          and(
            eq(assetVariants.accountId, accountId),
            eq(assetVariants.assetId, assetId),
            eq(assetVariants.id, variantId),
          ),
        )
        .get() ?? null
    );
  }

  listVariantsForAsset(accountId: string, assetId: string): AssetVariantRecord[] {
    return this.db
      .select()
      .from(assetVariants)
      .where(and(eq(assetVariants.accountId, accountId), eq(assetVariants.assetId, assetId)))
      .orderBy(assetVariants.kind)
      .all();
  }

  listForAccount(accountId: string): AssetRecord[] {
    return this.db
      .select()
      .from(assets)
      .where(eq(assets.accountId, accountId))
      .orderBy(desc(assets.createdAt))
      .all();
  }
}

export class PageRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: RepositoryClock = defaultClock,
  ) {}

  create(input: {
    accountId: string;
    title: string;
    width: number;
    height: number;
    documentJson?: string;
    id?: string;
  }): PageRecord {
    const timestamp = now(this.clock);
    const record: PageRecord = {
      id: input.id ?? createEntityId("page"),
      accountId: input.accountId,
      title: input.title,
      width: input.width,
      height: input.height,
      documentJson:
        input.documentJson ??
        JSON.stringify(
          createPageDocument({ canvas: { width: input.width, height: input.height } }),
        ),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(pages).values(record).run();

    return record;
  }

  findByIdForAccount(accountId: string, pageId: string): PageRecord | null {
    return (
      this.db
        .select()
        .from(pages)
        .where(and(eq(pages.accountId, accountId), eq(pages.id, pageId)))
        .get() ?? null
    );
  }

  listForAccount(accountId: string): PageRecord[] {
    return this.db
      .select()
      .from(pages)
      .where(eq(pages.accountId, accountId))
      .orderBy(desc(pages.updatedAt))
      .all();
  }

  updateForAccount(
    accountId: string,
    pageId: string,
    input: Partial<Pick<PageRecord, "documentJson" | "height" | "title" | "width">>,
  ): PageRecord | null {
    const existing = this.findByIdForAccount(accountId, pageId);

    if (!existing) {
      return null;
    }

    const timestamp = now(this.clock);
    const nextRecord = {
      title: input.title ?? existing.title,
      width: input.width ?? existing.width,
      height: input.height ?? existing.height,
      documentJson: input.documentJson ?? existing.documentJson,
      updatedAt: timestamp,
    };

    this.db
      .update(pages)
      .set(nextRecord)
      .where(and(eq(pages.accountId, accountId), eq(pages.id, pageId)))
      .run();

    return this.findByIdForAccount(accountId, pageId);
  }

  deleteByIdForAccount(accountId: string, pageId: string): boolean {
    const result = this.db
      .delete(pages)
      .where(and(eq(pages.accountId, accountId), eq(pages.id, pageId)))
      .run();

    return result.changes > 0;
  }
}

export class BookRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: RepositoryClock = defaultClock,
  ) {}

  create(input: { accountId: string; title: string; id?: string }): BookRecord {
    const timestamp = now(this.clock);
    const record: BookRecord = {
      id: input.id ?? createEntityId("book"),
      accountId: input.accountId,
      title: input.title,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(books).values(record).run();

    return record;
  }

  findByIdForAccount(accountId: string, bookId: string): BookRecord | null {
    return (
      this.db
        .select()
        .from(books)
        .where(and(eq(books.accountId, accountId), eq(books.id, bookId)))
        .get() ?? null
    );
  }

  listForAccount(accountId: string): BookRecord[] {
    return this.db
      .select()
      .from(books)
      .where(eq(books.accountId, accountId))
      .orderBy(desc(books.updatedAt))
      .all();
  }

  updateForAccount(
    accountId: string,
    bookId: string,
    input: Partial<Pick<BookRecord, "title">>,
  ): BookRecord | null {
    const existing = this.findByIdForAccount(accountId, bookId);

    if (!existing) {
      return null;
    }

    this.db
      .update(books)
      .set({ title: input.title ?? existing.title, updatedAt: now(this.clock) })
      .where(and(eq(books.accountId, accountId), eq(books.id, bookId)))
      .run();

    return this.findByIdForAccount(accountId, bookId);
  }

  listPagesForBook(
    accountId: string,
    bookId: string,
  ): Array<{ bookPage: BookPageRecord; page: PageRecord }> {
    return this.db
      .select({ bookPage: bookPages, page: pages })
      .from(bookPages)
      .innerJoin(pages, and(eq(bookPages.pageId, pages.id), eq(pages.accountId, accountId)))
      .where(and(eq(bookPages.accountId, accountId), eq(bookPages.bookId, bookId)))
      .orderBy(asc(bookPages.sortOrder))
      .all();
  }

  addPage(input: {
    accountId: string;
    bookId: string;
    pageId: string;
    sortOrder: number;
    id?: string;
  }): BookPageRecord {
    const book = this.findByIdForAccount(input.accountId, input.bookId);
    const page =
      this.db
        .select()
        .from(pages)
        .where(and(eq(pages.accountId, input.accountId), eq(pages.id, input.pageId)))
        .get() ?? null;

    if (!book || !page) {
      throw new OwnershipError("Book pages cannot cross account boundaries");
    }

    const timestamp = now(this.clock);
    const record: BookPageRecord = {
      id: input.id ?? createInternalId("bookPage"),
      accountId: input.accountId,
      bookId: input.bookId,
      pageId: input.pageId,
      sortOrder: input.sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(bookPages).values(record).run();

    return record;
  }

  replacePages(input: { accountId: string; bookId: string; pageIds: string[] }): BookPageRecord[] {
    const book = this.findByIdForAccount(input.accountId, input.bookId);

    if (!book) {
      throw new OwnershipError("Book does not belong to the account");
    }

    const uniquePageIds = new Set(input.pageIds);

    if (uniquePageIds.size !== input.pageIds.length) {
      throw new OwnershipError("A page can only appear once in a book");
    }

    for (const pageId of input.pageIds) {
      const page =
        this.db
          .select({ id: pages.id })
          .from(pages)
          .where(and(eq(pages.accountId, input.accountId), eq(pages.id, pageId)))
          .get() ?? null;

      if (!page) {
        throw new OwnershipError("Book pages cannot cross account boundaries");
      }
    }

    const timestamp = now(this.clock);
    const records = input.pageIds.map<BookPageRecord>((pageId, sortOrder) => ({
      id: createInternalId("bookPage"),
      accountId: input.accountId,
      bookId: input.bookId,
      pageId,
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    this.db
      .delete(bookPages)
      .where(and(eq(bookPages.accountId, input.accountId), eq(bookPages.bookId, input.bookId)))
      .run();

    if (records.length > 0) {
      this.db.insert(bookPages).values(records).run();
    }

    this.db
      .update(books)
      .set({ updatedAt: timestamp })
      .where(and(eq(books.accountId, input.accountId), eq(books.id, input.bookId)))
      .run();

    return records;
  }
}

export class ExportJobRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly clock: RepositoryClock = defaultClock,
  ) {}

  create(input: {
    accountId: string;
    format: ExportFormat;
    preset?: ExportPreset;
    bookId?: string | null;
    pageId?: string | null;
    outputStorageKey?: string | null;
    errorMessage?: string | null;
    id?: string;
  }): ExportJobRecord {
    const hasBook = input.bookId
      ? this.db
          .select({ id: books.id })
          .from(books)
          .where(and(eq(books.accountId, input.accountId), eq(books.id, input.bookId)))
          .get()
      : null;
    const hasPage = input.pageId
      ? this.db
          .select({ id: pages.id })
          .from(pages)
          .where(and(eq(pages.accountId, input.accountId), eq(pages.id, input.pageId)))
          .get()
      : null;

    if (!hasBook && !hasPage) {
      throw new OwnershipError("Export target must belong to the account");
    }

    const timestamp = now(this.clock);
    const record: ExportJobRecord = {
      id: input.id ?? createEntityId("export"),
      accountId: input.accountId,
      bookId: input.bookId ?? null,
      pageId: input.pageId ?? null,
      status: "queued",
      format: input.format,
      preset: input.preset ?? "digital",
      outputStorageKey: input.outputStorageKey ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.insert(exportJobs).values(record).run();

    return record;
  }

  findByIdForAccount(accountId: string, exportId: string): ExportJobRecord | null {
    return (
      this.db
        .select()
        .from(exportJobs)
        .where(and(eq(exportJobs.accountId, accountId), eq(exportJobs.id, exportId)))
        .get() ?? null
    );
  }

  updateForAccount(
    accountId: string,
    exportId: string,
    input: Partial<Pick<ExportJobRecord, "errorMessage" | "outputStorageKey" | "status">>,
  ): ExportJobRecord | null {
    const existing = this.findByIdForAccount(accountId, exportId);

    if (!existing) {
      return null;
    }

    this.db
      .update(exportJobs)
      .set({
        errorMessage: input.errorMessage ?? existing.errorMessage,
        outputStorageKey: input.outputStorageKey ?? existing.outputStorageKey,
        status: input.status ?? existing.status,
        updatedAt: now(this.clock),
      })
      .where(and(eq(exportJobs.accountId, accountId), eq(exportJobs.id, exportId)))
      .run();

    return this.findByIdForAccount(accountId, exportId);
  }
}

export const createRepositories = (db: AppDatabase, options: { clock?: RepositoryClock } = {}) => {
  const clock = options.clock ?? defaultClock;

  return {
    accounts: new AccountRepository(db, clock),
    authIdentities: new AuthIdentityRepository(db, clock),
    sessions: new SessionRepository(db, clock),
    assets: new AssetRepository(db, clock),
    pages: new PageRepository(db, clock),
    books: new BookRepository(db, clock),
    exports: new ExportJobRepository(db, clock),
  };
};

export type Repositories = ReturnType<typeof createRepositories>;
