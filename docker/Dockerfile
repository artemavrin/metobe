# syntax=docker/dockerfile:1

# One image, three commands: web (default), worker, and the `purr` CLI.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
# --ignore-scripts: skips the root `prepare` (lefthook needs git, which the image does not have).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm turbo build --filter=@purr/web --filter=@purr/cli --filter=@purr/worker

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    MIGRATIONS_DIR=/app/migrations
RUN addgroup -S purr && adduser -S purr -G purr
COPY --from=build --chown=purr:purr /repo/apps/web/.next/standalone ./
COPY --from=build --chown=purr:purr /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=purr:purr /repo/apps/cli/dist ./cli
COPY --from=build --chown=purr:purr /repo/apps/worker/dist ./worker
COPY --from=build --chown=purr:purr /repo/packages/db/migrations ./migrations
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint
COPY --chmod=755 docker/purr.sh /usr/local/bin/purr
USER purr
EXPOSE 3000
ENTRYPOINT ["entrypoint"]
CMD ["web"]
