# 0004: File-Backed Page Documents

Date: 2026-05-20

## Status

Accepted

## Context

Scrapbook page documents are creative artifacts that benefit from being easy to inspect, copy, back up, and eventually sync as ordinary files. SQLite is still useful for account ownership, auth/session lookup, sorted lists, book ordering, export jobs, and referential checks, but storing the full page document body only in a database row makes local data feel less transparent than the rest of the file-backed asset model.

## Decision

Keep SQLite as the index and control plane, but store canonical page document JSON as loose files under `ZAKKA_DATA_DIR/documents/accounts/<account-id>/pages/<page-id>/document.json`.

The `pages` table keeps title, dimensions, timestamps, ownership, and a `document_storage_key`. The legacy `document_json` column remains as a compatibility fallback for existing local databases, but new and updated page records write the document body to the filesystem.

## Consequences

- Page documents are easier to inspect and back up alongside uploaded assets and exports.
- SQLite still provides fast account-scoped lists, ownership checks, book ordering, and export job tracking.
- Backups must include the entire `ZAKKA_DATA_DIR`; copying only the SQLite files is incomplete.
- There is no single transaction spanning SQLite and filesystem writes, so repository methods write documents with atomic file replacement and keep database metadata closely synchronized.