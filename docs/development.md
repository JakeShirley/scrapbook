# Development Workflow

## Requirements

- Node.js 24 or newer.
- Corepack enabled so the repository can use the pinned pnpm version from `package.json`.

## Setup

```sh
corepack enable pnpm
pnpm install
```

Copy `.env.example` to `.env` if local settings need to differ from the defaults.

## Common Commands

```sh
pnpm dev
pnpm dev:api
pnpm dev:web
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:dry-run
```

The API health endpoint is available at `http://127.0.0.1:4000/api/v1/health` when the API dev server is running. The web client runs at `http://127.0.0.1:5173`.

## Docker

Run the local API container with persistent application data:

```sh
docker compose up --build
```

The Compose service exposes the API on `http://127.0.0.1:4000` and mounts the `scrapbook-data` Docker volume at `/data/scrapbook` inside the container. That path is the container value for `SCRAPBOOK_DATA_DIR` and will hold future SQLite files, uploads, variants, previews, and exports.

## Release Dry Runs

Release automation uses semantic-release with package manifests left at `0.0.0-development`. The local and GitHub Actions dry-run command calculates the next release from Conventional Commits without publishing, tagging, generating changelogs, or changing checked-in package versions.

## Repository Rules

- Keep package versions checked in as `0.0.0-development`.
- Use Conventional Commits for commit messages and pull request titles.
- Update `docs/engineering-roadmap.md` when task status changes.
- Keep secrets and runtime data out of Git.
- Add schemas, OpenAPI coverage, and tests with API behavior changes.
- Add migrations and data-safety notes with database behavior changes.