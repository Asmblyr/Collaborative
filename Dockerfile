FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build

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
