# reading-notifs

Track manga and webtoon chapter releases — get notified by email, Discord, or browser push the moment a new chapter drops.

[![CI](https://github.com/eliottness/reading-notifs/actions/workflows/ci.yml/badge.svg)](https://github.com/eliottness/reading-notifs/actions/workflows/ci.yml)
[![Docker](https://github.com/eliottness/reading-notifs/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/eliottness/reading-notifs/actions/workflows/docker-publish.yml)

## Features

- **Multi-site support** — MangaDex (plain HTTP) and Asura Scans (stealth browser via [Camoufox](https://camoufox.com/))
- **Multi-channel notifications** — email (SMTP), Discord webhook, and browser Web Push
- **Automatic polling** — configurable per-site intervals via `node-cron`
- **Magic-link auth** — passwordless login via [better-auth](https://www.better-auth.com/)
- **HTMX-powered UI** — server-side rendered pages with zero client-side JS framework
- **Extensible** — add new sites or notification providers with minimal code

## Architecture

```
src/
├── index.tsx           — Server entry point (migrate → seed → serve)
├── app.tsx             — Hono app: all HTTP routes
├── logger.ts           — Structured JSON logger
├── adapters/           — Site adapters (chapter count extraction)
│   ├── types.ts        — SiteAdapter interface
│   ├── registry.ts     — adapter registry
│   ├── asura-scans.ts  — Asura Scans (stealth fetch + Cheerio)
│   └── mangadex.ts     — MangaDex aggregate API (JSON)
├── fetchers/           — HTTP transport strategies
│   ├── http.ts         — Plain fetch with realistic UA rotation
│   └── stealth.ts      — Camoufox headless Firefox (anti-detect)
├── notifications/      — Notification providers
│   ├── providers/      — email, discord, push implementations
│   ├── dispatcher.ts   — fan-out to all user channels
│   └── registry.ts     — provider registry
├── poller/             — Background cron job (checks for new chapters)
├── auth/               — better-auth config + auth middleware
├── db/                 — Drizzle ORM: schema, migrations, seed
├── email/              — Nodemailer transporter singleton
└── ui/                 — Hono JSX pages (login, dashboard, …)
```

## Quick start

**Requirements:** Node.js ≥ 22

```bash
git clone https://github.com/eliottness/reading-notifs
cd reading-notifs
npm install
cp .env.example .env   # edit to taste
npm run db:generate    # generate the SQLite migration
npm run dev            # http://localhost:3000
```

## Environment variables

| Variable             | Required | Default                        | Description                                                         |
| -------------------- | -------- | ------------------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`       | yes      | `local.db`                     | SQLite file path (use `:memory:` for tests)                         |
| `BETTER_AUTH_SECRET` | yes      | —                              | Secret key for session tokens                                       |
| `APP_URL`            | no       | `http://localhost:3000`        | Public base URL (used in email links)                               |
| `SMTP_HOST`          | no       | `localhost`                    | SMTP server host                                                    |
| `SMTP_PORT`          | no       | `1025`                         | SMTP server port                                                    |
| `SMTP_FROM`          | no       | `noreply@reading-notifs.local` | Sender address                                                      |
| `SMTP_USER`          | no       | —                              | SMTP username (leave blank for unauthenticated)                     |
| `SMTP_PASS`          | no       | —                              | SMTP password                                                       |
| `VAPID_PUBLIC_KEY`   | no       | —                              | Web Push VAPID public key                                           |
| `VAPID_PRIVATE_KEY`  | no       | —                              | Web Push VAPID private key                                          |
| `VAPID_SUBJECT`      | no       | `mailto:admin@…`               | VAPID contact URI                                                   |
| `ADMIN_EMAILS`       | no       | — (no admins)                  | Comma-separated emails granted `/admin/*` access (case-insensitive) |
| `ALLOWED_DOMAINS`    | no       | — (allow all)                  | Comma-separated email domains permitted to sign in/up               |
| `ALLOWED_EMAILS`     | no       | — (allow all)                  | Comma-separated individual emails permitted to sign in/up           |

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

## Docker

### Compose (recommended for local dev)

Includes the app and [Mailpit](https://github.com/axllent/mailpit) for local email testing:

```bash
cp .env.example .env
# set BETTER_AUTH_SECRET to something random, e.g. openssl rand -hex 32
docker compose up
```

- App: <http://localhost:3000>
- Mailpit UI (inspect outgoing emails): <http://localhost:8025>

### Pull from GHCR

```bash
docker pull ghcr.io/eliottness/reading-notifs:latest

docker run -d \
  -e BETTER_AUTH_SECRET=your-secret \
  -e DATABASE_URL=/data/db.sqlite \
  -v "$(pwd)/data:/data" \
  -p 3000:3000 \
  ghcr.io/eliottness/reading-notifs:latest
```

> The image is Alpine-based and ships a bundled [Camoufox](https://camoufox.com/) (Firefox)
> binary for stealth-fetching bot-protected sites like Asura Scans.

## Kubernetes (Helm)

A Helm chart lives in [`charts/reading-notifs`](charts/reading-notifs). It runs a single
replica with a persistent SQLite volume (the app is stateful and not horizontally scalable —
see the chart README for details).

Install from the OCI registry (published on each release tag):

```bash
helm install reading-notifs oci://ghcr.io/eliottness/charts/reading-notifs \
  --version <chart-version> \
  --set secrets.betterAuthSecret="$(openssl rand -hex 32)" \
  --set ingress.host=notifs.example.com
```

Or from a local checkout: `helm install reading-notifs ./charts/reading-notifs --set secrets.betterAuthSecret=...`.
See [`charts/reading-notifs/README.md`](charts/reading-notifs/README.md) for all values.

## Extending

### Add a site adapter

1. Create `src/adapters/my-site.ts` implementing the `SiteAdapter` interface
   (see `src/adapters/types.ts` for the full contract).
2. Register it in `src/adapters/registry.ts`.
3. Set `fetcherStrategy: 'http'` for plain sites, or `'stealth'` for bot-protected ones
   (the stealth fetcher uses a headless Camoufox browser).

### Add a notification provider

1. Create `src/notifications/providers/my-channel.ts` implementing `NotificationProvider`
   (see `src/notifications/types.ts`).
2. Register it in `src/notifications/registry.ts`.

## Testing

```bash
npm test                   # run all tests (stealth browser test is skipped by default)
INTEGRATION=1 npm test     # include the stealth-fetcher integration test (requires browser)
```

Tests use an in-memory SQLite database and local mock servers — no external services
required for the standard suite.

## Scripts

| Command                | Description                       |
| ---------------------- | --------------------------------- |
| `npm run dev`          | Start with tsx watch (hot reload) |
| `npm run build`        | Compile TypeScript to `dist/`     |
| `npm start`            | Run the compiled app              |
| `npm run typecheck`    | Type-check without emitting       |
| `npm run lint`         | Run ESLint                        |
| `npm run lint:fix`     | Auto-fix ESLint errors            |
| `npm run format`       | Format with Prettier              |
| `npm run format:check` | Check formatting (used in CI)     |
| `npm test`             | Run Vitest                        |
| `npm run db:generate`  | Generate Drizzle migration        |
| `npm run db:push`      | Push schema directly (dev only)   |
| `npm run db:studio`    | Open Drizzle Studio               |

## License

MIT — see [LICENSE](LICENSE).
