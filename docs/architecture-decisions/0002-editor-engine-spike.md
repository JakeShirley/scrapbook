# ADR 0002: Basic Editor Engine Spike

Date: 2026-05-17

Status: Accepted

## Context

The first scrapbook editor slice needs users to create, save, reopen, and manipulate simple page documents with text and photo layers. The roadmap identified `tldraw`, Konva, and Fabric.js as candidates for richer canvas behavior including selection, transforms, image crop, export, and performance under many layers.

## Evaluation

| Candidate | Strengths | Tradeoffs |
| --- | --- | --- |
| `tldraw` | Strong selection model, transforms, handles, undo/redo, and polished interaction defaults. | Higher product-shape opinion and document model mapping cost for scrapbook-specific JSON. |
| Konva | Good React integration, mature canvas primitives, image transforms, hit testing, and export support. | Text editing and rich inspector behavior still need custom app logic. |
| Fabric.js | Mature object model with transforms, canvas export, and image controls. | React integration is less direct and TypeScript ergonomics are less aligned with the current stack. |
| DOM/CSS shell | Fast to ship with existing React, accessible forms, simple image/text layers, and no new runtime dependency. | Not a full canvas engine; drag handles, crop, snapping, and high-fidelity export should use a dedicated engine later. |

## Decision

Use a DOM/CSS editor shell for E09 and keep the page document model independent of the rendering engine. This lets the product ship page CRUD, asset-backed photo layers, text layers, ordering, duplication, deletion, and save state now without locking the document format to a canvas library.

Konva is the preferred next spike candidate when E10/E12 require richer direct manipulation, non-destructive crop controls, and image export parity. The current document schema is intentionally plain JSON so a Konva renderer can consume it later.

## Consequences

- Editor state lives in `@zakka/editor-core` as versioned JSON plus pure document helpers.
- API routes validate the same page document schema used by the web client.
- E09 can deliver a usable editor with form-based transforms while leaving drag handles, crop, snapping, undo/redo, and export fidelity for later phases.
