# Local Data

The API stores durable local data under `ZAKKA_DATA_DIR`. The default is `./storage/dev`, or `/data/zakka` when `NODE_ENV=production`; Docker Compose stores container data at `/data/zakka` backed by the `zakka-data` volume.

## Layout

```text
ZAKKA_DATA_DIR/
  scrapbook.sqlite
  scrapbook.sqlite-shm
  scrapbook.sqlite-wal
  documents/
    accounts/
      account_<id>/
        pages/
          page_<id>/
            document.json
  uploads/
  variants/
  previews/
  exports/
```

SQLite owns the `scrapbook.sqlite*` files. Page documents and stored binary objects live as loose files under managed subdirectories. Application code stores opaque storage keys such as `documents/accounts/account_<id>/pages/page_<id>/document.json` or `uploads/ab/<uuid>.jpg`, not absolute paths.

## Assets

Uploaded images are owned by the authenticated account that created them. The API stores original files under `uploads/`, generated thumbnails under `variants/`, and metadata plus checksums in SQLite. Asset listing, detail, original content, and variant content routes all resolve records by the current browser session account before reading from disk.

The upload endpoint accepts JPEG, PNG, and WebP images up to 20 MB. Originals are preserved as uploaded; thumbnail derivatives are generated as separate variant files and records.

## Pages

Scrapbook pages are owned by the authenticated account that created them. SQLite stores page title, canvas dimensions, timestamps, ownership, and the storage key for the page document. The canonical versioned page document JSON lives on disk under `documents/accounts/<account-id>/pages/<page-id>/document.json`. Page documents contain canvas settings plus ordered text and photo layers; photo layers may only reference assets owned by the same account.

Older local data may still have page document JSON in SQLite's legacy `document_json` column. New and updated pages write the document body to loose files; the repository layer can still read the legacy column as a fallback so existing development data can reopen.

Books are account-owned ordered collections of pages. The `book_pages` join table stores the stable page IDs and zero-based `sort_order`; replacing book order never deletes the underlying pages. Ordered pages are grouped into adjacent left/right facing spreads for previews, navigation, and export ordering, with an unpaired final page represented as a single-page spread.

Exports are account-owned jobs stored in SQLite with status, format, preset, target, and output storage key. The initial renderer writes completed PNG/JPEG outputs under `exports/`. Page exports render one saved page document; book exports render an ordered image sheet using the book's persisted page order.

Page create, list, detail, patch, duplicate, and delete routes all resolve records by the current browser session account before reading or writing page data.

## Migrations

The API runs migrations during startup before accepting requests. To migrate without starting the server, run:

```sh
pnpm --filter @zakka/api db:migrate
```

Migrations are idempotent and recorded in the `schema_migrations` table.

## Backup

Stop the API before making a filesystem backup so SQLite and file storage are captured together. Back up the entire `ZAKKA_DATA_DIR`, including `scrapbook.sqlite`, any `scrapbook.sqlite-wal` or `scrapbook.sqlite-shm` files, `documents/`, and the storage directories.

For Docker Compose, stop the service and archive the `zakka-data` volume contents from a temporary container or from Docker Desktop's volume tooling.

## Restore

Stop the API, replace the current `ZAKKA_DATA_DIR` with the backed-up directory, then start the API again. Startup migrations will apply any schema updates that were added after the backup was taken.

## Cleanup

Local development data is ignored by Git. To reset local state, stop the API and remove `storage/dev` or point `ZAKKA_DATA_DIR` at a fresh directory. For Docker Compose, remove the `zakka-data` volume only when you intentionally want to delete all local application data.