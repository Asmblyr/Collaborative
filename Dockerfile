FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base

FROM base AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build

# Keep the existing development Compose targets compatible.
FROM build AS core
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app/apps/core
USER node
CMD ["node", "dist/server.js"]

FROM build AS ui
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app/apps/ui
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]

FROM build AS production-dependencies
# Workspace packages are copied from this build, never downloaded from npm.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules examples/plugins/*/node_modules
RUN --network=none CI=true pnpm --filter-prod asmblyr-collaborative... --filter-prod @asmblyr-collaborative/core... install --prod --offline --frozen-lockfile
RUN node scripts/container/prepare.mjs /runtime

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
