# Digital Scrapbooking Web App Product Roadmap

_Last updated: 2026-05-17_

## Purpose

Build a functional digital scrapbooking product from zero code to a usable web app that combines the approachable creation flow of Canva, the canvas precision of Figma, and a light non-destructive photo editing workflow inspired by Photoshop.

Reference products for feature comparison include Canva, MyMemories Suite, Shutterfly, and Forever Artisan. The goal is not to clone any one tool, but to notice where each covers parts of the scrapbook workflow and use those gaps to prioritize a cohesive product.

This plan intentionally avoids implementation. It documents the architecture, product milestones, release conventions, and sequencing needed to move from an empty repository to a functional product.

## Product Goals

The first functional product should let users:

- Upload one or multiple photos into a local media library.
- Create scrapbook pages containing photos, text, shapes, embellishments, frames, stickers, patterned backgrounds, and visual styles.
- Apply light non-destructive edits such as cropping, borders, shadows, filters, masks, cutouts, and frame effects.
- Replace a previously placed photo with another uploaded photo while preserving the placement, frame, and styling when practical.
- Create books as ordered collections of pages, with clear page order and facing two-page spread design.
- Assign dates or date ranges to pages and books so memory timelines can be represented explicitly.
- Reopen, revise, duplicate, print, and export work digitally.

Longer term, the product should support native iOS and/or other native clients without rewriting the backend contract.

## Product Experience Requirements

The app should feel like a scrapbook tool, not only a modern layout editor:

- Book workflows must make page order obvious and allow users to design facing left/right pages together as a two-page spread while preserving the underlying ordered page model.
- Editor tools should support playful scrapbook composition: overlapping photos, non-square image frames, rotated or layered elements, decorative frames, stickers, embellishments, patterned paper, and themed reusable elements.
- Photo treatments should remain flexible and non-destructive, including opacity, crops, masks, cutouts, frame effects, shape/size edits, and repositioning within a frame without mutating the uploaded original.
- Asset selection should support batch uploads, choosing from an uploaded-photo pool, and swapping an existing photo placement for another asset without rebuilding the whole page element.
- Page and book metadata should support exact dates and date ranges for event, trip, family-history, or yearbook-style layouts.
- Future Gallery Mode should let users browse uploaded photos by tag, filter to specific tags, and sort by useful options such as upload date, captured date, title, or manual order.
- Output should support both print-oriented workflows and digital sharing/export, especially for full books where page and spread order matter.

## Technical Principles

- Use modern, actively maintained web technology current at project creation time.
- Keep client and server separated by a clean HTTP API, documented with OpenAPI.
- Treat the web app as one client of the API, not as the only client.
- Keep domain models portable and boring: accounts, books, pages, assets, page elements, edits, exports.
- Make user ownership and authorization part of the API from the first real data model.
- Store originals separately from derived previews/renders so edits remain non-destructive.
- Use SQLite first for simplicity and durability, with a schema that can migrate later.
- Host the source repository on GitHub and use GitHub-native automation for validation, releases, dependency updates, and container publishing.
- Keep repository version checked in as `0.0.0-development`; let `semantic-release` own published versions, tags, and changelogs.
- Use Conventional Commits from the beginning so release automation works later.

## Proposed Stack

Use exact latest stable versions available as of April 2026, verified immediately before scaffolding. The following stack is the intended direction, but the final implementation should confirm package health, deprecations, and framework guidance before any install commands are run.

### Repository

- Package manager: `pnpm` workspaces.
- Monorepo orchestration: Turborepo or native package scripts if the app remains small at first.
- Source hosting: GitHub repository with protected default branch, pull request checks, GitHub Actions, GitHub Releases, and GitHub Container Registry publishing.
- Language: TypeScript everywhere.
- Runtime: current active/LTS Node.js available at project start.
- Formatting/linting: Biome for fast formatting and linting, with targeted ESLint only if a framework requires rules Biome does not cover well.
- Testing: Vitest for unit tests, Playwright for end-to-end browser tests.

### Server

- API framework: Hono or Fastify on Node.js.
- API contract: OpenAPI generated from route schemas.
- Validation: Zod, Valibot, or Standard Schema-compatible validation. Prefer the option with the cleanest OpenAPI generation at implementation time.
- Database: SQLite.
- ORM/query layer: Drizzle ORM or Kysely. Prefer Drizzle if its migration and SQLite support remain strong at implementation time.
- File storage: local disk under a managed application data directory.
- Image processing: Sharp for server-side thumbnails, previews, and export-time raster processing.
- Background jobs: start with an in-process queue for thumbnails/exports, with an interface that can later move to a real queue.
- Distribution: publish the production app as an OCI-compatible Docker image that runs the API server and serves the built web client.
- Runtime configuration: use environment variables for deploy-time configuration, with validation at process startup and documented defaults for local development.

### Web Client

- Framework: React with a modern app setup, likely Vite plus React Router or TanStack Router.
- Data fetching: TanStack Query using a generated OpenAPI client.
- Canvas/editor rendering: evaluate `tldraw`, `fabric.js`, `Konva`, or a custom scene graph on Canvas/SVG. Prefer a proven canvas library for selection, transforms, drag/drop, snapping, grouping, and hit testing unless it blocks the scrapbook data model.
- State management: local editor state with a small explicit store such as Zustand or framework-native state; server state stays in TanStack Query.
- Styling: Tailwind CSS or CSS modules with design tokens. Choose the option that produces the least friction with the editor surface.

### Native Readiness

- API must be OpenAPI-first enough that a Swift client can generate or hand-write a client from the contract.
- Avoid JS-only API patterns such as tRPC for core product workflows.
- Do not expose database-shaped responses directly. Return stable resource DTOs.
- All client-visible IDs should be opaque strings.
- Keep upload, asset, page, book, render, and export APIs versionable under `/api/v1`.
- Authentication should support secure browser sessions and native-friendly token flows without requiring native clients to embed secrets.

## Initial Repository Layout

```text
scrapbook/
  .github/
    workflows/
  apps/
    api/
    web/
  packages/
    api-contract/
    domain/
    config/
    test-utils/
  docs/
    product-roadmap.md
    architecture.md
    api-guidelines.md
    configuration.md
    deployment.md
    release-process.md
  storage/
    .gitkeep
  package.json
  pnpm-workspace.yaml
  turbo.json
```

Notes:

- `apps/api` owns HTTP routes, persistence, migrations, file storage, and background tasks.
- `apps/web` owns the editor UI and web-specific interaction model.
- `.github/workflows` owns GitHub Actions automation for pull request checks, releases, container publishing, and scheduled maintenance.
- `packages/api-contract` owns shared OpenAPI generation helpers and generated clients, if useful.
- `packages/domain` owns stable domain types and pure helpers that do not depend on React, Hono, or SQLite.
- `storage` should be ignored except for placeholder files. Uploaded user data should not be committed.

## Data Model

### Core Entities

- `Account`: user-owned identity record for a person using the app.
- `AuthIdentity`: sign-in method linked to an account, such as email/password, passkey, or future OAuth provider identity.
- `Session`: browser session or native refresh session, including rotation and revocation metadata.
- `Asset`: original uploaded file plus metadata, including future user-maintained tags and captured-date fields for gallery filtering and sorting.
- `AssetVariant`: generated thumbnail, preview, cropped render, or export-time derivative.
- `Page`: canvas-sized document containing ordered elements, page-level settings, and optional exact-date or date-range metadata.
- `PageElement`: photo, text, shape, sticker, embellishment, decorative frame, patterned background, or group.
- `PhotoEdit`: non-destructive edit stack attached to a photo element or reusable asset placement, including crop, mask/cutout, visual effects, and general transformations such as scale and flip.
- `Book`: named collection of ordered pages, with optional exact-date or date-range metadata for the overall scrapbook.
- `BookPage`: join/order record connecting books and pages.
- `ExportJob`: requested render/export task and output metadata.

### Non-Destructive Photo Editing

Uploaded originals are immutable. Edits are stored as structured instructions, for example:

```json
{
  "transform": { "scaleX": 1.2, "scaleY": 1.2, "rotation": 0, "flipX": false, "flipY": false, "offsetX": 0, "offsetY": 0 },
  "crop": { "x": 0.12, "y": 0.08, "width": 0.72, "height": 0.68 },
  "opacity": 0.85,
  "filters": [{ "type": "brightness", "value": 1.05 }],
  "border": { "style": "solid", "width": 12, "color": "#ffffff", "radius": 8 },
  "shadow": { "x": 0, "y": 8, "blur": 20, "color": "rgba(0,0,0,0.22)" }
}
```

The editor renders these instructions live. The server uses the same serialized edit stack to generate thumbnails, previews, and exports. Transform metadata should be represented separately from crop metadata so users can scale, rotate, flip, and reposition a photo inside its frame without losing the original crop/edit intent.

## API Shape

All API routes should live under `/api/v1` and produce OpenAPI documentation.

### Authentication Model

The app should support a real set of user accounts. All user-owned resources should be scoped to the authenticated account unless an endpoint explicitly documents another access model.

Recommended model:

- Prefer passkeys/WebAuthn for modern passwordless sign-in.
- Support email/password as an initial fallback, storing passwords only with a modern memory-hard hash such as Argon2id.
- Require verified email before enabling sensitive account actions.
- Use secure, HTTP-only, `SameSite=Lax` or stricter cookies for the web app session.
- Protect cookie-authenticated mutating requests with CSRF defenses.
- Support native clients with OAuth 2.1-style Authorization Code with PKCE, short-lived bearer access tokens, and rotating refresh tokens.
- Store session and refresh-token secrets hashed at rest.
- Rotate refresh tokens on every use and revoke the token family on suspected reuse.
- Make logout, device/session listing, and session revocation first-class API operations.
- Add rate limiting and audit logging around registration, login, password reset, passkey enrollment, and token refresh.

Initial authentication resources:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/session`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/{sessionId}`
- `POST /api/v1/auth/password/reset-requests`
- `POST /api/v1/auth/password/resets`
- `POST /api/v1/auth/passkeys/registration-options`
- `POST /api/v1/auth/passkeys`
- `POST /api/v1/auth/passkeys/authentication-options`
- `DELETE /api/v1/auth/passkeys/{credentialId}`

Initial account resources:

- `GET /api/v1/accounts/me`
- `PATCH /api/v1/accounts/me`
- `DELETE /api/v1/accounts/me`

Initial product resources:

- `GET /api/v1/health`
- `POST /api/v1/assets/uploads`
- `GET /api/v1/assets`
- `GET /api/v1/assets/{assetId}`
- `GET /api/v1/assets/{assetId}/content`
- `GET /api/v1/assets/{assetId}/variants/{variantId}`
- `POST /api/v1/pages`
- `GET /api/v1/pages`
- `GET /api/v1/pages/{pageId}`
- `PATCH /api/v1/pages/{pageId}`
- `POST /api/v1/pages/{pageId}/duplicate`
- `DELETE /api/v1/pages/{pageId}`
- `POST /api/v1/books`
- `GET /api/v1/books`
- `GET /api/v1/books/{bookId}`
- `PATCH /api/v1/books/{bookId}`
- `PUT /api/v1/books/{bookId}/pages`
- `POST /api/v1/exports`
- `GET /api/v1/exports/{exportId}`

API documentation requirements:

- Every route has request and response schemas.
- Every error response follows a shared error envelope.
- Every write endpoint has examples in the generated OpenAPI output.
- Domain DTOs are versioned intentionally, not inferred from database tables.
- Authentication schemes, protected endpoints, and required scopes are declared in the OpenAPI document.
- Authorization checks are tested at the API boundary, especially for cross-account access attempts.

## Release And Versioning Rules

The repository should start and remain checked in with:

```json
{
  "version": "0.0.0-development"
}
```

Use `semantic-release` to calculate real versions from Conventional Commits. Do not manually commit generated changelogs or package version bumps.

### GitHub Project And Publishing Model

The project should live in GitHub and use GitHub as the primary collaboration, release, and package publishing surface.

Repository expectations:

- Use GitHub issues for feature work, bugs, and product decisions.
- Use pull requests for all changes after the initial scaffold.
- Protect the default branch so required checks pass before merge.
- Require Conventional Commit-compatible PR titles or squash commit messages.
- Use GitHub Dependabot or Renovate for dependency update pull requests.
- Use GitHub CodeQL, secret scanning, and dependency review where available.
- Publish human-readable release entries to GitHub Releases through semantic-release.
- Publish the Docker image to GitHub Container Registry under the repository owner, for example `ghcr.io/<owner>/<repo>`.

Recommended GitHub Actions workflows:

- `ci.yml`: runs on pull requests and pushes to the default branch; installs dependencies, checks formatting, lints, typechecks, runs unit tests, validates OpenAPI generation, and builds web/API packages.
- `api-contract.yml`: runs on pull requests that touch API schemas or routes; regenerates or validates the OpenAPI document and fails on undocumented API drift.
- `e2e.yml`: runs Playwright tests on pull requests that touch app code and on a scheduled cadence for broader coverage.
- `container.yml`: builds the production Docker image on pull requests without publishing, then runs a smoke test against `/api/v1/health`.
- `release.yml`: runs on pushes to the release branch, invokes semantic-release, creates GitHub Releases, and publishes Docker images to GHCR with version and channel tags.
- `maintenance.yml`: scheduled workflow for dependency audits, container rebuild checks, and stale generated artifact validation.

Workflow rules:

- Pull request workflows should not require release secrets.
- Release and package publishing should happen only from protected branches.
- Docker images should be signed or attestations should be generated if GitHub's current supply-chain tooling is available.
- Build provenance, SBOM generation, and vulnerability scanning should be enabled before public releases.
- Workflow permissions should use least privilege, especially `contents`, `packages`, `id-token`, and `security-events`.

### Docker Publishing

The production artifact should be a Docker/OCI image built in GitHub Actions and published to GitHub Container Registry.

Container requirements:

- Build the web app into static assets and serve them from the same deployable container as the API unless a later hosting decision requires split deployments.
- Use a multi-stage Dockerfile so development dependencies and build tools are not present in the final runtime image.
- Run as a non-root user in the final image.
- Keep user data outside the container filesystem by mounting persistent volumes for SQLite and uploaded assets.
- Expose one HTTP port, configured by `PORT`.
- Include a container health check that calls `GET /api/v1/health`.
- Apply database migrations on startup only if the migration tooling can do so safely and idempotently; otherwise document a separate migration command.
- Publish image tags from semantic-release to GHCR using immutable version tags and a moving channel tag, for example `1.4.2` and `latest` for the default release channel.
- Keep the checked-in package version as `0.0.0-development`; image tags come from semantic-release, not committed version changes.

Expected local container workflow:

- `docker compose up` should start the app with persistent local volumes for the database and asset storage.
- `docker compose down` should stop the app without deleting user data.
- Local container defaults should be useful for development, but production secrets must be explicitly provided.

### Configuration Model

Configuration should be explicit, typed, validated, and documented. The app should fail fast at startup when required production configuration is missing or invalid.

Configuration sources:

- Environment variables are the primary runtime configuration mechanism for local, Docker, and hosted deployments.
- A checked-in `.env.example` documents every supported variable with safe placeholder values.
- Local `.env` files may be used for development but must not be committed.
- Secrets must come from the deployment environment, container orchestrator, or secret manager, not from source control.

Initial configuration variables:

- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: HTTP port exposed by the app.
- `APP_BASE_URL`: public origin used for links, auth callbacks, cookies, and CORS decisions.
- `DATABASE_URL`: SQLite connection string or file path.
- `DATA_DIR`: root directory for app-managed persistent data.
- `ASSET_STORAGE_DIR`: directory for original uploads and generated derivatives.
- `SESSION_SECRET`: high-entropy secret for signed/encrypted web session material.
- `CSRF_SECRET`: high-entropy secret for CSRF protection.
- `ACCESS_TOKEN_TTL_SECONDS`: short-lived native/API access token lifetime.
- `REFRESH_TOKEN_TTL_SECONDS`: refresh-session lifetime.
- `COOKIE_DOMAIN`: optional cookie domain for deployed web environments.
- `COOKIE_SECURE`: whether auth cookies require HTTPS.
- `CORS_ALLOWED_ORIGINS`: comma-separated origins allowed to call the API from browsers.
- `SMTP_URL`: optional mail transport for verification and password reset messages.
- `MAIL_FROM`: sender address for account emails.
- `UPLOAD_MAX_BYTES`: maximum upload size.
- `IMAGE_MAX_PIXELS`: maximum decoded image dimensions or total pixels.
- `LOG_LEVEL`: runtime logging verbosity.

Documentation requirements:

- `docs/configuration.md` should describe every variable, default, whether it is required, and whether it is secret.
- `docs/deployment.md` should document Docker image usage, volume mounts, health checks, migrations, backup/restore, and example production configuration.
- The OpenAPI health response should avoid leaking secrets while still reporting configuration-sensitive readiness, such as database and asset storage availability.

Recommended commit types:

- `feat:` for user-visible features.
- `fix:` for bug fixes.
- `docs:` for documentation-only changes.
- `test:` for tests.
- `refactor:` for internal changes that do not change behavior.
- `chore:` for maintenance.
- `ci:` for automation.
- `build:` for build system changes.

Breaking changes should use `!` and a `BREAKING CHANGE:` footer.

Examples:

```text
feat(api): add page creation endpoint
feat(web): add photo upload panel
fix(editor): preserve crop when resizing photo elements
docs: add API guidelines
chore(release): configure semantic-release
```

## Milestone Plan

### Milestone 0: Repository Foundation

Goal: create a healthy project skeleton without product behavior.

Deliverables:

- Initialize workspace and package manager.
- Add root package metadata with version `0.0.0-development`.
- Add app/package layout.
- Add TypeScript, formatting, linting, and test configuration.
- Add GitHub Actions CI for install, format, lint, typecheck, tests, OpenAPI validation, and builds.
- Add `semantic-release` configuration without committing release artifacts.
- Add GitHub branch protection and pull request workflow expectations to documentation.
- Add production Dockerfile and local Docker Compose plan.
- Add typed runtime configuration validation and `.env.example`.
- Add documentation for local development, API guidelines, configuration, deployment, and release process.

Acceptance criteria:

- A fresh checkout can install dependencies and run validation commands.
- CI passes on an empty product shell.
- Release automation is configured but not manually run for local development.
- GitHub Actions workflows are documented and the initial CI workflow passes on pull requests.
- Container image can be built locally.
- Missing or invalid required configuration fails with a clear startup error.

### Milestone 1: API And Persistence Backbone

Goal: establish the server, database, migrations, and documented API contract.

Deliverables:

- Create API app with health route.
- Add SQLite database connection and migration tooling.
- Add shared API error envelope.
- Generate OpenAPI documentation from route schemas.
- Add integration test harness using an isolated temporary SQLite database.
- Add initial tables for accounts, auth identities, sessions, assets, pages, books, and book-page ordering.

Acceptance criteria:

- API starts locally.
- OpenAPI document is generated and valid.
- Database migrations apply from a clean database.
- Health and basic resource tests pass.
- Authenticated and unauthenticated API behavior is covered by integration tests.

### Milestone 2: Photo Uploads And Asset Library

Goal: users can upload images and browse them in the web app.

Deliverables:

- Add multipart upload endpoint with file type and size validation.
- Support selecting and uploading multiple photos in one action, with per-file success and error reporting.
- Store original uploads on disk using content-addressed or opaque generated paths.
- Persist asset metadata in SQLite.
- Generate thumbnails/previews with Sharp.
- Add asset listing and detail endpoints.
- Build web upload flow and asset library panel.

Acceptance criteria:

- User can upload one or more supported image formats.
- Original files remain untouched.
- Asset library shows thumbnails and metadata.
- Bad uploads return clear API errors.

### Milestone 3: Page Model And Basic Editor

Goal: users can create a page and place content on it.

Deliverables:

- Add page CRUD endpoints.
- Define page document schema with canvas size, background, and ordered elements.
- Build editor shell with toolbar, canvas, side panels, inspector, and page list.
- Support adding photo elements from the asset library.
- Support replacing a previously placed photo from the asset library while preserving element bounds, frame style, opacity, and other non-destructive edits where the replacement can safely inherit them.
- Support text elements with font size, color, alignment, and basic style controls.
- Support overlapping elements, non-square element bounds, and explicit layer order from the first editor schema.
- Support select, move, resize, rotate, reorder, duplicate, and delete.
- Add autosave or explicit save with visible save state.

Acceptance criteria:

- User can create a page, add photos and text, arrange them, save, leave, and reopen the page.
- User can swap a placed photo for another uploaded photo without deleting and recreating the page element.
- Page JSON validates on both client and server.
- Invalid page updates are rejected with useful errors.

### Milestone 4: Non-Destructive Photo Editing

Goal: users can apply light photo edits without changing originals.

Deliverables:

- Add edit stack schema for general transforms, crop, mask/cutout, border, corner radius, shadow, opacity, and simple filters.
- Add transform controls for scaling, rotation, flipping, opacity, and repositioning photos inside frames.
- Add crop UI with aspect ratio presets, free crop, crop size controls, frame shape controls, and in-frame photo pan/zoom.
- Add border/frame controls, including decorative scrapbook frame styles and non-square photo frames.
- Add mask/cutout controls so photos can be clipped to shapes or reusable cutout presets without mutating originals.
- Add preview rendering in the editor.
- Add server-side preview/render logic using the same edit stack.
- Add tests proving originals are not mutated.

Acceptance criteria:

- User can crop, resize, reshape, adjust opacity, and style a photo element, save it, reopen it, and keep editing from the original.
- Resetting edits returns the element to the original upload view.
- Server-rendered previews match editor behavior closely enough for export.

### Milestone 5: Books

Goal: users can organize pages into books and design facing spreads in the proper order.

Deliverables:

- Add book CRUD endpoints.
- Add book-page ordering endpoint.
- Build book list and book detail views.
- Add page-level and book-level exact-date/date-range fields.
- Support adding/removing/reordering pages in a book.
- Add a spread-aware book view that shows adjacent left/right pages and makes single-page cases explicit.
- Add a two-page spread editor mode that lets users design facing pages together while saving each page in book order.
- Add page duplication for quick layout reuse.

Acceptance criteria:

- User can create a book, add pages, reorder them, and reopen the book later.
- User can record dates or date ranges for pages and books and see those values when browsing or editing.
- User can open a facing two-page spread, design across the pair, and return to the book with page order preserved.
- Page order persists.
- Removing a page from a book does not delete the page unless explicitly requested.

### Milestone 6: Export And Print-Oriented Output

Goal: users can export pages and books for print and digital sharing.

Deliverables:

- Add export job model and endpoints.
- Render single pages to PNG or JPEG.
- Render books to a zipped collection of images or PDF, depending on the chosen library, preserving page and spread order.
- Add export progress/status UI.
- Add print-size presets, DPI metadata, bleed/margin settings where practical, and digital-friendly export presets.

Acceptance criteria:

- User can export a single page.
- User can export a full book.
- Exported output reflects saved page state.
- Exported books preserve proper page order and produce useful print-oriented and digital formats.
- Export failures are visible and recoverable.

### Milestone 7: Product Polish

Goal: make the app feel usable beyond a technical demo.

Deliverables:

- Add undo/redo for editor operations.
- Add keyboard shortcuts for common actions.
- Add snapping, alignment guides, and basic layer controls.
- Add Gallery Mode for uploaded photos with user tags, tag filters, and sort options such as upload date, captured date, title, and manual order.
- Add empty states and loading states.
- Improve responsive layout for tablet-sized screens.
- Add destructive action confirmations.
- Add import/export backup option for local projects.

Acceptance criteria:

- Common editing operations feel predictable.
- The app handles empty libraries, slow uploads, and failed saves gracefully.
- End-to-end tests cover the main happy path from upload to export.

### Milestone 8: GitHub And Container Release Readiness

Goal: make the app easy to ship from GitHub and operate as a Dockerized product.

Deliverables:

- Add GitHub Actions image build and vulnerability/dependency scanning.
- Publish release images to GHCR through semantic-release.
- Publish release notes to GitHub Releases through semantic-release.
- Add immutable version tags and documented channel tags.
- Add production Docker Compose example with persistent volumes.
- Document startup, configuration, migrations, backup, restore, and upgrade flow.
- Add smoke test that runs the built container and checks `/api/v1/health`.
- Add artifact provenance, SBOM, signing, or attestations using current GitHub-supported tooling where practical.

Acceptance criteria:

- A protected-branch release can publish a GitHub Release and GHCR Docker image without committing version or changelog changes.
- The published image can start from documented environment variables and mounted volumes.
- User data survives container replacement.
- Operators can identify required secrets and storage paths from documentation.

## Testing Strategy

- Unit tests for domain schema validation and editor document helpers.
- Integration tests for API routes, migrations, and file storage behavior.
- Contract tests to ensure OpenAPI output matches implemented routes.
- Browser end-to-end tests for upload, page creation, editing, book creation, and export.
- Visual regression tests later for editor rendering if canvas behavior becomes complex.

## Security And Data Safety

- Validate uploaded file MIME type and actual file signature.
- Limit upload size and dimensions.
- Hash passwords with Argon2id or the strongest current memory-hard option available in the chosen runtime.
- Hash session and refresh-token secrets at rest.
- Use refresh-token rotation, reuse detection, and revocation for long-lived sessions.
- Apply rate limits to registration, login, password reset, passkey enrollment, and upload endpoints.
- Store files outside the web root.
- Serve assets through controlled API routes.
- Sanitize text inputs used in rendered HTML or SVG contexts.
- Use path-safe storage keys only; never trust user-provided filenames as paths.
- Back up or preserve originals before generating derived assets.

## Open Decisions

Resolve these before Milestone 0 implementation:

- Choose the final web app framework: Vite plus router, Next.js, or another current stable option.
- Choose the editor canvas engine after a short prototype comparing selection, transform, text, image, and export needs.
- Choose exact API framework and schema tooling based on OpenAPI quality.
- Choose whether exports should initially support PDF or image bundles only.
- Decide which sign-in methods ship first: passkeys only, email/password plus passkeys, or email/password first with passkeys immediately after.

## First Implementation Slice

When implementation begins, the smallest valuable slice should be:

1. Create the monorepo foundation.
2. Add the API health route and OpenAPI generation.
3. Add SQLite migrations for accounts, sessions, assets, pages, and books.
4. Add registration, login, current-session, and logout endpoints.
5. Add photo upload with thumbnails scoped to the authenticated account.
6. Add a web flow that signs in, uploads a photo, and displays the account's asset library.

This slice proves the architecture, storage model, authentication model, API contract, and client/server boundary before the editor becomes complex.
