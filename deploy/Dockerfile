# syntax=docker/dockerfile:1

FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:demo

FROM node:24-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3501

COPY --from=build --chown=node:node /app/demo-dist ./demo-dist
COPY --from=build --chown=node:node /app/LICENSE /app/SOUND_LICENSE.md /app/THIRD_PARTY_NOTICES.md ./

EXPOSE 3501
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3501/').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "./demo-dist/server/entry.mjs"]
