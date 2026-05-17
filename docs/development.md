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
```

The API health endpoint is available at `http://127.0.0.1:4000/api/v1/health` when the API dev server is running. The web client runs at `http://127.0.0.1:5173`.

## Repository Rules

- Keep package versions checked in as `0.0.0-development`.
- Use Conventional Commits for commit messages and pull request titles.
- Update `docs/engineering-roadmap.md` when task status changes.
- Keep secrets and runtime data out of Git.
- Add schemas, OpenAPI coverage, and tests with API behavior changes.
- Add migrations and data-safety notes with database behavior changes.