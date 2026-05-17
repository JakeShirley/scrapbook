# Configuration

Runtime configuration is parsed by `@scrapbook/config` at process startup. Local defaults are safe for development and can be overridden with environment variables.

| Variable | Default | Required | Secret | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | No | No | One of `development`, `test`, or `production`. |
| `API_HOST` | `127.0.0.1` | No | No | Hostname used by the local API server. |
| `API_PORT` | `4000` | No | No | Port used by the local API server. |
| `WEB_ORIGIN` | `http://localhost:5173` | No | No | Browser origin allowed during local development. |
| `SCRAPBOOK_DATA_DIR` | `./storage/dev` | No | No | Root for local SQLite files, uploads, variants, previews, and exports. |

The Docker Compose API service overrides `API_HOST` to `0.0.0.0`, `WEB_ORIGIN` to `http://localhost:4000`, and `SCRAPBOOK_DATA_DIR` to `/data/scrapbook`. That container path is backed by the `scrapbook-data` Docker volume so future SQLite files, uploads, variants, previews, and exports persist across container restarts.

Browser sessions use an HTTP-only cookie and store only a hashed per-session secret in SQLite. The cookie is marked `Secure` when `NODE_ENV=production`.

Future production-only secrets for CSRF, password reset tokens, and native refresh tokens should be added here in the same change that introduces the behavior.