# syntax=docker/dockerfile:1

# --- build stage: install everything and build api (self-contained bundle) + web ---
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -r run build

# --- runtime stage: just node + the bundled output (no node_modules needed) ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV WEB_DIR=/app/web
COPY --from=build /app/packages/api/dist ./dist
COPY --from=build /app/packages/api/migrations ./migrations
COPY --from=build /app/packages/web/dist ./web
EXPOSE 8080
# Apply migrations, (re)seed the demo meshes, then start. Seeding is idempotent, so a
# restart resets the public demo to a known-good state.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/seed/seed.js && node dist/index.js"]
