# Local Data

The API stores durable local data under `SCRAPBOOK_DATA_DIR`. The default is `./storage/dev`; Docker Compose uses `/data/scrapbook` backed by the `scrapbook-data` volume.

## Layout

```text
SCRAPBOOK_DATA_DIR/
  scrapbook.sqlite
  scrapbook.sqlite-shm
  scrapbook.sqlite-wal
  uploads/
  variants/
  previews/
  exports/
```

SQLite owns the `scrapbook.sqlite*` files. The storage adapter owns the other directories and returns opaque storage keys such as `uploads/ab/<uuid>.jpg`. Application code should store those keys, not absolute paths.

## Assets

Uploaded images are owned by the authenticated account that created them. The API stores original files under `uploads/`, generated thumbnails under `variants/`, and metadata plus checksums in SQLite. Asset listing, detail, original content, and variant content routes all resolve records by the current browser session account before reading from disk.

The upload endpoint accepts JPEG, PNG, and WebP images up to 20 MB. Originals are preserved as uploaded; thumbnail derivatives are generated as separate variant files and records.

## Migrations

The API runs migrations during startup before accepting requests. To migrate without starting the server, run:

```sh
pnpm --filter @scrapbook/api db:migrate
```

Migrations are idempotent and recorded in the `schema_migrations` table.

## Backup

Stop the API before making a filesystem backup so SQLite and file storage are captured together. Back up the entire `SCRAPBOOK_DATA_DIR`, including `scrapbook.sqlite`, any `scrapbook.sqlite-wal` or `scrapbook.sqlite-shm` files, and the storage directories.

For Docker Compose, stop the service and archive the `scrapbook-data` volume contents from a temporary container or from Docker Desktop's volume tooling.

## Restore

Stop the API, replace the current `SCRAPBOOK_DATA_DIR` with the backed-up directory, then start the API again. Startup migrations will apply any schema updates that were added after the backup was taken.

## Cleanup

Local development data is ignored by Git. To reset local state, stop the API and remove `storage/dev` or point `SCRAPBOOK_DATA_DIR` at a fresh directory. For Docker Compose, remove the `scrapbook-data` volume only when you intentionally want to delete all local application data.