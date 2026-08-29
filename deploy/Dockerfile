# syntax=docker/dockerfile:1

# The documentation site is an Astro SSR app (@astrojs/node, standalone mode).
# Its runtime dependencies come from Astro itself, which lives in devDependencies
# of the library package, so the runtime stage carries the installed node_modules
# rather than a production-only install.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:demo

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3501

COPY --from=build /app/demo-dist ./demo-dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3501
CMD ["node", "./demo-dist/server/entry.mjs"]
