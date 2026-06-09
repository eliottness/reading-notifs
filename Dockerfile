# Build stage — compile TypeScript and generate DB migrations
FROM node:26-alpine AS builder
WORKDIR /app
COPY .npmrc package*.json ./
RUN npm ci
COPY tsconfig*.json drizzle.config.ts ./
COPY src ./src
RUN npm run build && npm run db:generate

# Runtime stage — Debian 13 (trixie) glibc base; Camoufox is a Firefox fork and
# needs genuine glibc, so Alpine + gcompat shims are not viable (browser launch hangs).
FROM node:26-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Installing firefox-esr pulls in the full set of transitive shared libraries that
# Camoufox's bundled Firefox binary depends on, avoiding hand-enumeration of trixie's
# t64-renamed lib packages. fonts-liberation gives baseline glyph coverage for rendering.
RUN apt-get update \
    && apt-get install -y --no-install-recommends firefox-esr fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY .npmrc package*.json ./
# Install production deps then download the Camoufox browser binary (~300 MB, baked into image)
RUN npm ci --omit=dev && npx camoufox-js fetch

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
# Static files (sw.js, push.js) are not emitted by tsc — copy them explicitly
COPY src/public ./dist/public

EXPOSE 3000
CMD ["node", "dist/index.js"]
