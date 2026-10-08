<a id="развертывание-и-обновление"></a>

# Deployment and upgrades

For local development, start with [first-time setup](./getting-started.md).
The primary distribution uses separate Core and UI images from the same commit;
PostgreSQL 17+ and S3-compatible storage are connected separately. Images are
published as `ghcr.io/asmblyr/collaborative-core` and
`ghcr.io/asmblyr/collaborative-ui`; pin both to the same release and their
respective digests. Each installation serves one team; a workspace is not a tenant.

| Scenario                                       | Start here                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary deployment with external PostgreSQL/S3 | [`deploy/compose.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/compose.yaml) and [`deploy/env.example`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/env.example) |
| Local environment with PostgreSQL and MinIO    | [`deploy/local/compose.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/local/compose.yaml)                                                                                       |
| Legacy monolithic image                        | [`deploy/compose.monolith.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/compose.monolith.yaml)                                                                                 |

Build and run commands, port settings, GHCR, and container checks are covered in
the [deployment README](https://github.com/Asmblyr/Collaborative/blob/main/deploy/README.md).
The primary Compose setup runs migrations in a separate short-lived Core container
before starting the application. By default, it exposes the shared address on
loopback port 3000. Do not carry local secrets or an HTTP origin into a public installation.

<a id="конфигурация"></a>

## Configuration

For the primary deployment, copy `deploy/env.example` to a private file outside
the repository. Core reads `DATABASE_URL` and other settings from the environment.
See the complete commented template in
[`apps/core/.env.example`](https://github.com/Asmblyr/Collaborative/blob/main/apps/core/.env.example).
The main settings are:

- `ASMBLYR_SETUP_TOKEN` is required until the first superuser is created.
- `AUTH_UI_URL` specifies the exact external UI origin and is required in production.
- `SECRETS_LOCAL_KEY` protects stored integration secrets.
- Configure S3 in system settings or with `FILES_STORAGE`, `FILES_BUCKET`, and
  provider-specific settings. The operator creates the bucket.
- `OPENAI_API_KEY` and `OPENAI_API_MODEL` enable the optional assistant unless
  `ASSISTANT_ENABLED` is `false`.
- `OAUTH_ISSUER_URL` and `OAUTH_KEYS_FILE` configure Collaborative as an OAuth
  provider. Generate signing keys separately and preserve them across upgrades.

Values and limits are documented in the environment templates and the guides for
[integrations](../features/integrations.md), [files](../features/files.md), and
[the assistant](../features/assistant.md). Keep secrets and keys out of Git and images.

<a id="публичная-установка"></a>

## Public installations

Put UI and Core API behind an HTTPS reverse proxy. Keep PostgreSQL and the bucket
private; the primary Compose setup binds ports to loopback only. The operator owns
TLS, IAM, backups, and monitoring. `GET /health` checks the process; `GET /ready`
checks the database and required migrations. Local backup scripts do not manage
an external cloud bucket.

<a id="обновление-и-восстановление"></a>

## Upgrades and recovery

Before an upgrade, take a consistent backup of PostgreSQL and objects, test recovery
in a separate installation, and apply migrations **before starting the new Core**.
Do not edit old migrations. `db:rollback` can delete data and does not replace
restoring a backup. An image rollback is possible only when its schema is compatible.
The optional local environment has
[backup/restore commands and status checks](../development/operations.md).

For installation hardening, see [security boundaries](../security/overview.md).
