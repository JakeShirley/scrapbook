# Project Guidelines

## User-Facing Changes

All user-facing changes must be validated locally in a browser before the work is considered complete. Run the relevant dev server or preview, open the affected page or flow, and confirm the UI renders and behaves as intended.

In the final response, state what local browser validation was performed. If browser validation is not possible, explain why and describe the fallback verification used.

## Validate Changes Locally
Before submitting a pull request, ensure that all changes have been validated locally with the appropriate NPM scripts. At minimum run `pnpm -w run typecheck`, `pnpm -w run lint`, and `pnpm -w run test`. For changes that touch any UI or screenshot fixture, also run `pnpm screenshots` so the Playwright suite executes the way CI will.

## Screenshot Scenarios and Visual Diff CI
The `App Visual Diffs` workflow (`.github/workflows/app-visual-diffs.yml`) runs the **head branch's** `apps/web/screenshots/app-screenshots.spec.ts` against **two** webservers: the HEAD workspace and a worktree of the merge-base commit. That means any new scenario must be authored so it still succeeds when the UI and API it targets do not yet exist on the merge-base.

When adding or modifying screenshot scenarios:

- Do not assert that brand-new UI elements, routes, or text are visible inside `waitFor` for a scenario that targets a page that already existed. `waitFor` should only assert state that is present in both the merge-base and HEAD workspaces (typically the page heading or shell chrome).
- Put feature-specific interactions in `prepare`, guard them with the existing `isVisible(...)` helper, and bail out early when the new affordance is missing. The `image-grid` scenario and `waitForFeatureOrFallback` already follow this pattern — copy it.
- Mock API routes added for a new feature with the same falsey-tolerant shape (route by path prefix, return an empty/fallback payload when the request shape is unknown) so the merge-base UI's smaller request set still resolves.
- Before publishing the change, sanity-check the merge-base run locally: stand up a vite from a worktree at the PR's base commit on port 5174 and run `pnpm --filter @scrapbook/web screenshots:capture -g <scenario>` against it. The new scenario should pass and produce a screenshot of the unmodified page.

## API and Schema Changes
When adding API endpoints, persistence tables, or migrations:

- Update `apps/web/screenshots/app-screenshots.spec.ts`'s mock API to handle the new path. The catch-all 404 will fail every scenario whose page issues the new request, even if that scenario predates the change.
- Migrations are append-only and tracked in `apps/api/src/persistence/migrations.test.ts`. Update both the migration array and the test's expected migration ids and table names in the same change.
- When extending a Zod response schema, update every test fixture and mock that constructs that shape (notably `createAsset` in the screenshot spec). A missing nullable field will be rejected by `schema.parse` and surface as a runtime error in the browser, not a type error.

## Commit Messages
When writing commit messages, use conventional commit formatting.  You can use these types of commits:
- `feat`: A new user facing feature has been added.
- `fix`: A user facing bug has been fixed.
- `refactor`: Code has been refactored without adding features or fixing bugs.
- `chore`: Changes to build process, dependencies, or other non-user facing changes.

If you are working on a GitHub issue, make sure the first line includes "(fixes #<issue number>)" to automatically link the commit to the issue.

## Committing Changes
Do not automatically commit changes when working on items unless explicitly instructed to do so.