# ADR 0001: Initial Application Stack

Date: 2026-05-17

Status: Accepted

## Context

The project needs to move from roadmaps to a runnable application foundation while preserving the product goals: a web client, a separately documented HTTP API, local-first durability, and future native-client readiness.

Package availability was checked against npm on 2026-05-17 before scaffolding.

## Decisions

- Use Node.js 24 or newer with TypeScript across the repository.
- Use pnpm workspaces with Turborepo task orchestration.
- Use Biome for formatting and linting, with Vitest for unit and integration tests.
- Use Hono for the API server because it is small, Fetch-native, easy to test in-process, and works cleanly in a production Node runtime.
- Use Zod with `@hono/zod-openapi` for request and response schemas so runtime validation and OpenAPI generation stay close to route definitions.
- Use Drizzle ORM for the planned SQLite layer because it keeps SQL visible, supports migrations, and provides strong TypeScript inference. The first scaffold records the choice; database work starts in the persistence phase.
- Use Vite with React for the web client because the app should behave as a client of the API, build as static assets, and remain easy to serve from the API container later.
- Ship email/password authentication with secure web sessions first, then add native-friendly PKCE/token flows, then passkeys.
- Evaluate tldraw, Konva, and Fabric for the editor spike before committing to the scrapbook canvas implementation.

## Consequences

- API routes must expose stable DTOs and schemas under `/api/v1`; database-shaped responses should not leak into clients.
- The web client can start before auth exists, but protected data workflows wait for the account/session layer.
- Generated releases remain outside checked-in package versions; package manifests stay at `0.0.0-development`.
- SQLite and storage paths are configured through the shared config package before persistence is added.