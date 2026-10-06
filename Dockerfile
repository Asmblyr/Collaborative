FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base

FROM base AS build
WORKDIR /app
ARG DEPLOYMENT_VERSION=local
ENV NEXT_DEPLOYMENT_ID=$DEPLOYMENT_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build

FROM build AS production-dependencies
# Workspace packages are copied from this build, never downloaded from npm.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules examples/plugins/*/node_modules
RUN --network=none CI=true pnpm --filter-prod asmblyr-collaborative... --filter-prod @asmblyr-collaborative/core... install --prod --offline --frozen-lockfile
RUN node scripts/container/prepare.mjs /runtime

# Production images share a build and release, but contain separate runtimes.
FROM base AS core
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=production-dependencies /runtime ./
COPY scripts/container/migrate.mjs ./scripts/container/
COPY scripts/operations/migrate.mjs ./scripts/operations/
USER node
EXPOSE 3001
CMD ["node", "apps/core/dist/server.js"]

FROM base AS ui
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /app/apps/ui/.next/standalone ./
COPY --from=build /app/apps/ui/.next/static ./apps/ui/.next/static/
RUN mkdir -p /app/apps/ui/.next/cache && chown -R node:node /app/apps/ui/.next/cache
USER node
EXPOSE 3000
CMD ["node", "apps/ui/server.js"]

# Compatibility target for existing single-container installations.
FROM base AS app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 CORE_PORT=3001
WORKDIR /app
COPY --from=production-dependencies /runtime ./
COPY --from=build /app/apps/ui/.next/standalone ./ui/
COPY --from=build /app/apps/ui/.next/static ./ui/apps/ui/.next/static/
COPY scripts/container/start.mjs scripts/container/health.mjs scripts/container/migrate.mjs ./scripts/container/
RUN mkdir -p /app/ui/apps/ui/.next/cache && chown -R node:node /app/ui/apps/ui/.next/cache
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=3 CMD ["node", "scripts/container/health.mjs"]
CMD ["node", "scripts/container/start.mjs"]
