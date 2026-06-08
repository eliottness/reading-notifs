# Build stage — compile TypeScript and generate DB migrations
FROM node:22-alpine AS builder
WORKDIR /app
COPY .npmrc package*.json ./
RUN npm ci
COPY tsconfig*.json drizzle.config.ts ./
COPY src ./src
RUN npm run build && npm run db:generate

# Runtime stage — Alpine + Camoufox (glibc-compat Firefox) for stealth fetching
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# glibc compatibility shims + all runtime deps required by Camoufox/Firefox headless
RUN apk add --no-cache \
    gcompat libstdc++ libgcc nss \
    gtk+3.0 dbus-glib alsa-lib pango cairo \
    libx11 libxcb libxcomposite libxdamage libxext libxfixes libxrandr libxrender libxtst \
    font-noto ttf-freefont

COPY package*.json ./
# Install production deps then download the Camoufox browser binary (~300 MB, baked into image)
RUN npm ci --omit=dev && npx camoufox-js fetch

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
# Static files (sw.js, push.js) are not emitted by tsc — copy them explicitly
COPY src/public ./dist/public

EXPOSE 3000
CMD ["node", "dist/index.js"]
