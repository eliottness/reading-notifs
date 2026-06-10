# reading-notifs Helm chart

Deploys [reading-notifs](https://github.com/eliottness/reading-notifs), a manga/webtoon
chapter notifier (Hono + HTMX + SQLite + better-auth), to Kubernetes.

## Architecture notes (important)

reading-notifs is **stateful and single-instance by design**:

- It stores everything in an embedded **SQLite** database (WAL mode, single writer).
- It runs the chapter **poller as an in-process cron**.

For both reasons the chart **always runs exactly one replica** with a `Recreate` update
strategy and a `ReadWriteOnce` volume. Do not scale it horizontally.

## Install

From the OCI registry (published on each release tag):

```sh
helm install reading-notifs oci://ghcr.io/eliottness/charts/reading-notifs \
  --version <chart-version> \
  --set secrets.betterAuthSecret="$(openssl rand -hex 32)" \
  --set ingress.host=notifs.example.com
```

From a local checkout:

```sh
helm install reading-notifs ./charts/reading-notifs \
  --set secrets.betterAuthSecret="$(openssl rand -hex 32)"
```

`secrets.betterAuthSecret` is **required** (the chart refuses to render without it),
unless you point `secrets.existingSecret` at a Secret you manage yourself.

### Using an existing Secret

Create a Secret with these keys and reference it via `secrets.existingSecret`:
`BETTER_AUTH_SECRET`, `SMTP_USER`, `SMTP_PASS`, `VAPID_PRIVATE_KEY`.

## Values

| Key                                    | Default                                        | Description                                                     |
| -------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| `replicaCount`                         | `1`                                            | Fixed at 1 — do not raise (SQLite + in-process cron).           |
| `image.repository`                     | `ghcr.io/eliottness/reading-notifs`            | Container image.                                                |
| `image.tag`                            | `""`                                           | Defaults to the chart `appVersion`.                             |
| `image.pullPolicy`                     | `IfNotPresent`                                 | Image pull policy.                                              |
| `imagePullSecrets`                     | `[]`                                           | Pull secrets for a private registry.                            |
| `service.type`                         | `ClusterIP`                                    | Service type.                                                   |
| `service.port`                         | `3000`                                         | Service/container port (also sets `PORT`).                      |
| `ingress.enabled`                      | `true`                                         | Create an Ingress.                                              |
| `ingress.className`                    | `""`                                           | IngressClass name.                                              |
| `ingress.host`                         | `reading-notifs.local`                         | Hostname; also derives `APP_URL`.                               |
| `ingress.scheme`                       | `http`                                         | Scheme used to derive `APP_URL` (TLS not managed by the chart). |
| `ingress.annotations`                  | `{}`                                           | Ingress annotations.                                            |
| `persistence.enabled`                  | `true`                                         | Create/mount a data PVC.                                        |
| `persistence.existingClaim`            | `""`                                           | Use an existing PVC instead of creating one.                    |
| `persistence.size`                     | `1Gi`                                          | Requested storage.                                              |
| `persistence.storageClass`             | `""`                                           | StorageClass (`""`=default, `-`=none).                          |
| `persistence.mountPath`                | `/app/data`                                    | Where the volume is mounted.                                    |
| `resources`                            | req 250m/256Mi, lim 1/1Gi                      | Container resources (Camoufox needs headroom).                  |
| `config.appUrl`                        | `""`                                           | Public base URL; derived from ingress host if empty.            |
| `config.adminEmails`                   | `""`                                           | Comma-separated admin emails (`/admin/*`).                      |
| `config.databaseUrl`                   | `/app/data/reading-notifs.db`                  | SQLite path (keep under `mountPath`).                           |
| `config.smtp.host` / `.port` / `.from` | `""` / `1025` / `noreply@reading-notifs.local` | SMTP settings.                                                  |
| `config.vapid.publicKey` / `.subject`  | `""` / `mailto:admin@reading-notifs.local`     | Web Push public config.                                         |
| `secrets.existingSecret`               | `""`                                           | Use an externally managed Secret.                               |
| `secrets.betterAuthSecret`             | `""`                                           | **Required** better-auth secret.                                |
| `secrets.smtp.user` / `.pass`          | `""`                                           | SMTP credentials.                                               |
| `secrets.vapid.privateKey`             | `""`                                           | Web Push VAPID private key.                                     |
| `extraEnv`                             | `[]`                                           | Extra env vars appended to the container.                       |

## Testing the release

```sh
helm test reading-notifs
```

## Distribution

The chart is published as an OCI artifact to `ghcr.io/eliottness/charts/reading-notifs`
by `.github/workflows/helm-publish.yml` on every `v*` git tag (the chart version is taken
from the tag).
