# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/widget/package.json ./apps/widget/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ui/package.json ./packages/ui/package.json

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build
RUN bun build apps/server/src/index.ts --target bun --outfile dist/server.js --minify

FROM oven/bun:1-alpine AS runtime

ARG APP_VERSION=0.1.0
LABEL org.opencontainers.image.title="See" \
      org.opencontainers.image.description="TMDB proxy, multi-provider torrent search, AI release verification, and qBittorrent tracking" \
      org.opencontainers.image.version="${APP_VERSION}"

RUN apk add --no-cache ca-certificates curl tzdata

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data \
    PUBLIC_DIR=/app/public \
    HOME=/tmp \
    APP_VERSION=${APP_VERSION}

COPY --from=build /app/dist/server.js /app/server.js
COPY --from=build /app/apps/server/public /app/public

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

EXPOSE 8080
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["bun", "/app/server.js"]
