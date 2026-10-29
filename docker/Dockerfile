# syntax=docker/dockerfile:1

# One image, four commands: web (default), worker, updater, and the `metobe` CLI.
FROM ghcr.io/sigstore/cosign/cosign:v3.1.4 AS cosign-bin

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
# --ignore-scripts: skips the root `prepare` (lefthook needs git, which the image does not have).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm turbo build --filter=@metobe/web --filter=@metobe/cli --filter=@metobe/worker

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    MIGRATIONS_DIR=/app/migrations
RUN addgroup -S metobe && adduser -S metobe -G metobe
# The updater's tools (D35): compose to recreate the stack, pg_dump and pg_restore for the copy of the base.
RUN apk add --no-cache ca-certificates docker-cli docker-cli-compose postgresql18-client
COPY --from=cosign-bin /ko-app/cosign /usr/local/bin/cosign
COPY --from=build --chown=metobe:metobe /repo/apps/web/.next/standalone ./
COPY --from=build --chown=metobe:metobe /repo/apps/web/.next/static ./apps/web/.next/static
# Standalone output leaves public/ out; the sign-in clips and posters live there.
COPY --from=build --chown=metobe:metobe /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=metobe:metobe /repo/apps/cli/dist ./cli
COPY --from=build --chown=metobe:metobe /repo/apps/worker/dist ./worker
COPY --from=build --chown=metobe:metobe /repo/packages/db/migrations ./migrations
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint
COPY --chmod=755 docker/metobe.sh /usr/local/bin/metobe
USER metobe
EXPOSE 3000
ENTRYPOINT ["entrypoint"]
CMD ["web"]
