import type Database from "better-sqlite3";

export type Migration = {
  id: string;
  sql: string;
};

export const migrations: readonly Migration[] = [
  {
    id: "0001_initial_schema",
    sql: `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'account_*'),
  display_name TEXT NOT NULL,
  primary_email TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX accounts_primary_email_unique ON accounts (primary_email);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'auth_identity_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('email_password', 'passkey', 'native_token')),
  provider_subject TEXT NOT NULL,
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_subject)
);
CREATE INDEX auth_identities_account_id_idx ON auth_identities (account_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'session_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sessions_account_id_idx ON sessions (account_id);
CREATE UNIQUE INDEX sessions_secret_hash_unique ON sessions (secret_hash);

CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'asset_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  original_storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  checksum_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX assets_account_id_idx ON assets (account_id);
CREATE UNIQUE INDEX assets_original_storage_key_unique ON assets (original_storage_key);

CREATE TABLE asset_variants (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'asset_variant_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('thumbnail', 'preview', 'render', 'export')),
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  checksum_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX asset_variants_account_id_idx ON asset_variants (account_id);
CREATE INDEX asset_variants_asset_id_idx ON asset_variants (asset_id);
CREATE UNIQUE INDEX asset_variants_storage_key_unique ON asset_variants (storage_key);
CREATE UNIQUE INDEX asset_variants_asset_kind_unique ON asset_variants (asset_id, kind);

CREATE TABLE pages (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'page_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX pages_account_id_idx ON pages (account_id);

CREATE TABLE books (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'book_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX books_account_id_idx ON books (account_id);

CREATE TABLE book_pages (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'book_page_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (book_id, sort_order),
  UNIQUE (book_id, page_id)
);
CREATE INDEX book_pages_account_id_idx ON book_pages (account_id);
CREATE INDEX book_pages_book_id_idx ON book_pages (book_id);

CREATE TABLE exports (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'export_*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  book_id TEXT REFERENCES books (id) ON DELETE SET NULL,
  page_id TEXT REFERENCES pages (id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  format TEXT NOT NULL CHECK (format IN ('png', 'jpeg', 'pdf', 'zip')),
  output_storage_key TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (book_id IS NOT NULL OR page_id IS NOT NULL)
);
CREATE INDEX exports_account_id_idx ON exports (account_id);
CREATE INDEX exports_book_id_idx ON exports (book_id);
CREATE INDEX exports_page_id_idx ON exports (page_id);
`,
  },
  {
    id: "0002_add_export_presets",
    sql: `
ALTER TABLE exports ADD COLUMN preset TEXT NOT NULL DEFAULT 'digital' CHECK (preset IN ('digital', 'print'));
`,
  },
  {
    id: "0003_add_book_page_size",
    sql: `
ALTER TABLE books ADD COLUMN page_width INTEGER NOT NULL DEFAULT 2400 CHECK (page_width >= 320 AND page_width <= 10000);
ALTER TABLE books ADD COLUMN page_height INTEGER NOT NULL DEFAULT 3000 CHECK (page_height >= 320 AND page_height <= 10000);
`,
  },
  {
    id: "0004_add_page_document_storage_key",
    sql: `
ALTER TABLE pages ADD COLUMN document_storage_key TEXT;
CREATE UNIQUE INDEX pages_document_storage_key_unique ON pages (document_storage_key) WHERE document_storage_key IS NOT NULL;
`,
  },
];

export const ensureMigrationTable = (sqlite: Database.Database) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
`);
};

export const getAppliedMigrations = (sqlite: Database.Database): string[] => {
  ensureMigrationTable(sqlite);

  return sqlite
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all()
    .map((row) => (row as { id: string }).id);
};

export const runMigrations = (sqlite: Database.Database): string[] => {
  sqlite.pragma("foreign_keys = ON");
  ensureMigrationTable(sqlite);

  const applied = new Set(getAppliedMigrations(sqlite));
  const appliedNow: string[] = [];
  const applyMigration = sqlite.transaction((migration: Migration) => {
    sqlite.exec(migration.sql);
    sqlite
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(migration.id, new Date().toISOString());
  });

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    applyMigration(migration);
    appliedNow.push(migration.id);
  }

  return appliedNow;
};
