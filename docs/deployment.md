# Deployment

Zakka is packaged as a single production Docker image. The container starts the Hono API, applies SQLite migrations, serves the built web app, and stores user data under `/data/zakka`.

## Image

GitHub Actions publishes images to GitHub Container Registry:

```sh
docker pull ghcr.io/jakeshirley/zakka:latest
```

Default-branch publishes also include the `main` tag and immutable `sha-*` tags.

The image runs as the non-root `node` user, exposes port `4000`, and includes a health check for `GET /api/v1/health`.

## Configuration

Set these environment variables when running the container:

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `API_HOST` | `0.0.0.0` |
| `API_PORT` | `4000` or the port exposed by your platform |
| `WEB_ORIGIN` | Public browser origin, for example `https://zakka.example.com` |
| `SESSION_COOKIE_SECURE` | Optional override; leave unset for per-request auto detection |

Mount persistent storage at `/data/zakka`; the image uses that path for SQLite files, page documents, uploads, variants, previews, and exports.

For HTTPS reverse proxies, overwrite and forward the original scheme so the app can issue `Secure` cookies for the remote URL while still allowing plain local HTTP access:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

Browsers store cookies per host, so signing in at a local IP address and at a remote domain creates two separate browser sessions.

## Run Locally

```sh
docker compose up --build
```

The compose file publishes the app at `http://localhost:4000` and stores data in the `zakka-data` volume.

## Run The Published Image

```sh
docker volume create zakka-data
docker run --detach \
  --name zakka \
  --publish 4000:4000 \
  --env NODE_ENV=production \
  --env API_HOST=0.0.0.0 \
  --env API_PORT=4000 \
  --env WEB_ORIGIN=http://localhost:4000 \
  --volume zakka-data:/data/zakka \
  ghcr.io/jakeshirley/zakka:latest
```

Check health after startup:

```sh
curl --fail http://localhost:4000/api/v1/health
```

## Upgrade

1. Pull the new image tag.
2. Stop the old container.
3. Start the new container with the same `/data/zakka` volume.
4. Check `/api/v1/health`.

Migrations run on startup. Keep a backup of the data volume before upgrades.

## Backup And Restore

Stop the container before filesystem backups so SQLite and stored files are captured together. Back up the entire `/data/zakka` mount, including `scrapbook.sqlite`, WAL/SHM files, page documents, uploads, variants, previews, and exports.

To restore, start a new container with the restored directory mounted at `/data/zakka`.
