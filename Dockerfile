# syntax=docker/dockerfile:1

# ── Build stage ─────────────────────────────────────────────────────────────
# Full node image so any native deps (e.g. LevelDB bindings) build cleanly.
FROM node:20 AS build
WORKDIR /app

# Install against the lockfile first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build the Next app. NEXT_PUBLIC_COLLAB_URL is deliberately left unset so the
# client falls back to the same-origin /collab endpoint (see useYDoc.ts).
COPY . .
RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# The custom server is precompiled to a single dist/server.js (esbuild, CJS) at
# build time — no tsx/transpile on the runtime critical path, so boot is faster.
# We still ship node_modules (the server's deps are externalized) + .next, plus
# src because src/data is the seed for a fresh volume; at runtime the app
# reads/writes DATA_DIR (the mounted volume).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

EXPOSE 3000
CMD ["npm", "run", "start"]
