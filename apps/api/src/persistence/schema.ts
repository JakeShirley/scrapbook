import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const authIdentityProviders = ["email_password", "passkey", "native_token"] as const;
export const assetVariantKinds = ["thumbnail", "preview", "render", "export"] as const;
export const exportStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;
export const exportFormats = ["png", "jpeg", "pdf", "zip"] as const;

export type AuthIdentityProvider = (typeof authIdentityProviders)[number];
export type AssetVariantKind = (typeof assetVariantKinds)[number];
export type ExportStatus = (typeof exportStatuses)[number];
export type ExportFormat = (typeof exportFormats)[number];

const timestampColumns = () => ({
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const schemaMigrations = sqliteTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: text("applied_at").notNull(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email").notNull(),
    ...timestampColumns(),
  },
  (table) => [uniqueIndex("accounts_primary_email_unique").on(table.primaryEmail)],
);

export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: authIdentityProviders }).notNull(),
    providerSubject: text("provider_subject").notNull(),
    passwordHash: text("password_hash"),
    ...timestampColumns(),
  },
  (table) => [
    index("auth_identities_account_id_idx").on(table.accountId),
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    ...timestampColumns(),
  },
  (table) => [
    index("sessions_account_id_idx").on(table.accountId),
    uniqueIndex("sessions_secret_hash_unique").on(table.secretHash),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    originalStorageKey: text("original_storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    checksumSha256: text("checksum_sha256").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("assets_account_id_idx").on(table.accountId),
    uniqueIndex("assets_original_storage_key_unique").on(table.originalStorageKey),
  ],
);

export const assetVariants = sqliteTable(
  "asset_variants",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: assetVariantKinds }).notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    checksumSha256: text("checksum_sha256").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("asset_variants_account_id_idx").on(table.accountId),
    index("asset_variants_asset_id_idx").on(table.assetId),
    uniqueIndex("asset_variants_storage_key_unique").on(table.storageKey),
    uniqueIndex("asset_variants_asset_kind_unique").on(table.assetId, table.kind),
  ],
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    documentJson: text("document_json").notNull(),
    ...timestampColumns(),
  },
  (table) => [index("pages_account_id_idx").on(table.accountId)],
);

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ...timestampColumns(),
  },
  (table) => [index("books_account_id_idx").on(table.accountId)],
);

export const bookPages = sqliteTable(
  "book_pages",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("book_pages_account_id_idx").on(table.accountId),
    index("book_pages_book_id_idx").on(table.bookId),
    uniqueIndex("book_pages_book_sort_order_unique").on(table.bookId, table.sortOrder),
    uniqueIndex("book_pages_book_page_unique").on(table.bookId, table.pageId),
  ],
);

export const exportJobs = sqliteTable(
  "exports",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    bookId: text("book_id").references(() => books.id, { onDelete: "set null" }),
    pageId: text("page_id").references(() => pages.id, { onDelete: "set null" }),
    status: text("status", { enum: exportStatuses }).notNull(),
    format: text("format", { enum: exportFormats }).notNull(),
    outputStorageKey: text("output_storage_key"),
    errorMessage: text("error_message"),
    ...timestampColumns(),
  },
  (table) => [
    index("exports_account_id_idx").on(table.accountId),
    index("exports_book_id_idx").on(table.bookId),
    index("exports_page_id_idx").on(table.pageId),
  ],
);

export type AccountRecord = typeof accounts.$inferSelect;
export type AuthIdentityRecord = typeof authIdentities.$inferSelect;
export type SessionRecord = typeof sessions.$inferSelect;
export type AssetRecord = typeof assets.$inferSelect;
export type AssetVariantRecord = typeof assetVariants.$inferSelect;
export type PageRecord = typeof pages.$inferSelect;
export type BookRecord = typeof books.$inferSelect;
export type BookPageRecord = typeof bookPages.$inferSelect;
export type ExportJobRecord = typeof exportJobs.$inferSelect;
