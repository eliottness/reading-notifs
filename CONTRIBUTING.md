# Contributing

## Dev setup

```bash
git clone https://github.com/eliottness/reading-notifs
cd reading-notifs
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

## Commands

| Command                | Purpose                     |
| ---------------------- | --------------------------- |
| `npm run lint`         | Run ESLint                  |
| `npm run lint:fix`     | Auto-fix lint errors        |
| `npm run format`       | Format with Prettier        |
| `npm run format:check` | Check formatting            |
| `npm run typecheck`    | Type-check without building |
| `npm test`             | Run tests                   |
| `npm run build`        | Compile to `dist/`          |

All CI checks must pass before merging: lint → format:check → typecheck → test → build.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add webtoon.xyz adapter
fix: handle null chapter count in MangaDex adapter
chore: bump dependencies
docs: update environment variable table
```

## Pull requests

- Open a PR against `main`
- Fill in the PR template (what changed and why)
- All CI checks must be green

## Adding a site adapter

See [Extending](README.md#extending) in the README.

## Adding a notification provider

See [Extending](README.md#extending) in the README.
