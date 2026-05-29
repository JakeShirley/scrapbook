# syntax=docker/dockerfile:1.7

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.json tsconfig.base.json biome.json vitest.config.ts ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api-contract/package.json packages/api-contract/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/editor-core/package.json packages/editor-core/package.json
COPY packages/test-utils/package.json packages/test-utils/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS api
ENV NODE_ENV="production"
ENV API_HOST="0.0.0.0"
ENV API_PORT="4000"
ENV WEB_ORIGIN="http://localhost:5173"
ENV WEB_ASSETS_DIR="/app/apps/web/dist"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/api-contract/package.json packages/api-contract/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/editor-core/package.json packages/editor-core/package.json
RUN pnpm install --prod --frozen-lockfile --filter @scrapbook/api...

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/api-contract/dist packages/api-contract/dist
COPY --from=build /app/packages/config/dist packages/config/dist
COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/editor-core/dist packages/editor-core/dist

RUN mkdir -p /data/scrapbook \
  && chown -R node:node /app /data/scrapbook

USER node
EXPOSE 4000
VOLUME ["/data/scrapbook"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["pnpm", "--filter", "@scrapbook/api", "start"]
