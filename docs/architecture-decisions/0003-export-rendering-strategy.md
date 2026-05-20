# 0003: Initial Export Rendering Strategy

Date: 2026-05-17

## Status

Accepted

## Context

Scrapbook needs export output before the editor has a dedicated canvas rendering engine. The current editor stores a portable page document JSON model and renders it in the browser with DOM/CSS. Export work must preserve account ownership, avoid mutating source assets, and support both single pages and ordered books.

## Decision

Use a server-side SVG-to-image renderer backed by Sharp for the first export implementation.

The API converts saved page documents into SVG, embeds account-owned original assets as data URLs, and rasterizes the result to PNG or JPEG. Digital exports render at a reduced scale for sharing. Print exports keep the saved page dimensions and use higher output quality. Book exports initially produce an ordered contact-sheet image that preserves book page order and facing-spread grouping; PDF and ZIP bundles remain future extensions of the same export job model. Page document bodies are loaded through the repository layer, which may hydrate them from file-backed storage.

## Consequences

- Export output is generated from saved page JSON, so users must save editor changes before exporting.
- Rendering parity is intentionally close enough for the current DOM editor, but advanced CSS-only effects may need explicit SVG support as the editor grows.
- Export jobs are tracked in SQLite and completed synchronously for now. The repository and route shape can move to a background queue later without changing the client contract.
- Output files are stored under the `exports/` storage area and can be backed up with the rest of `SCRAPBOOK_DATA_DIR`.
