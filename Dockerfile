# Build stage — compile TypeScript and generate DB migrations
FROM node:26-alpine AS builder
WORKDIR /app
COPY .npmrc package*.json ./
RUN npm ci
COPY tsconfig*.json drizzle.config.ts ./
COPY src ./src
RUN npm run build && npm run db:generate

# Runtime stage — Debian 13 (trixie) glibc base. The app no longer ships a browser
# (Camoufox runs in a separate sidecar container — see .omc/plans/camoufox-sidecar-split.md).
# We keep trixie-slim (not alpine) because camoufox-js remains a runtime dependency for the
# in-process fallback path (CAMOUFOX_WS_ENDPOINT unset), and its native bindings expect glibc.
FROM node:26-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY .npmrc package*.json ./
# Production deps only. No browser binary is fetched — the Camoufox sidecar supplies the browser.
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
# Static files (sw.js, push.js) are not emitted by tsc — copy them explicitly
COPY src/public ./dist/public

EXPOSE 3000
CMD ["node", "dist/index.js"]
