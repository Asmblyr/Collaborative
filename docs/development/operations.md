<a id="эксплуатация-и-восстановление"></a>

# Operations and recovery

Each team uses a separate installation, PostgreSQL database, and private bucket.
SMTP is optional: an administrator can share invitation or recovery links manually.
Workspaces do not separate companies' data.

<a id="сборка-и-установка"></a>

## Build and deployment

The Dockerfile builds separate Core/UI images and a compatible monolithic target,
using a pinned Node image digest, pnpm, and the lockfile. Applications run as `node`.
The primary deployment exposes a shared UI/API origin; PostgreSQL and S3 are external.
The GitHub workflow checks types, lint, tests, documentation, production builds,
and container startup with disposable PostgreSQL before publishing to GHCR.

[Deployment templates](https://github.com/Asmblyr/Collaborative/blob/main/deploy/README.md)
include a local setup with S3 and a setup for external PostgreSQL/buckets.
Migrations run before Core. Public installations require an HTTPS reverse proxy,
the exact external `AUTH_UI_URL`, and private database/bucket access. Preserve
OAuth signing keys across releases and back them up separately.

Before upgrading, back up data and test migrations on a restored installation.
Image rollback requires a compatible schema; destructive migration rollback is
not a substitute for recovery.

<a id="копии-локальнои-docker-установки"></a>

## Backups of the local Docker installation

These tools support only `deploy/local/compose.yaml`:

```sh
node scripts/operations/backup.mjs /private/asmblyr.env asmblyr-local /private/backups/new-copy
node scripts/operations/restore.mjs /private/restore.env asmblyr-restore-check /private/backups/new-copy
node scripts/operations/status.mjs /private/restore.env asmblyr-restore-check
```

Backup stops UI/Core and S3, saves `pg_dump -Fc` and the offline object volume,
records SHA-256 hashes and image IDs, then restarts services even if copying fails.
Use a new backup directory and ensure no other process writes to the database or S3.

Restore verifies hashes and image versions and accepts only a new
`asmblyr-restore-NAME` project without existing volumes. It runs `pg_restore`,
restores the object volume, and applies migrations. Use a separate UI port.
After recovery, verify sign-in, record counts, permissions, and file content.
Back up environment files and signing keys separately from database/object data.

For external PostgreSQL/S3, the operator takes a consistent backup with writers
stopped and restores into new resources. Local Compose scripts do not copy cloud
buckets or provision infrastructure. Backups contain user data and credential
hashes: keep them private and encrypt them with your backup system.

<a id="восстановить-администратора"></a>

## Recover an administrator

After building Core, an operator with database access can run:

```sh
node scripts/operations/admin-recover.mjs admin@example.test /private/new-credential.json
```

Pass `DATABASE_URL` through the process environment. The command writes a private
file containing a new random password, does not print it, and refuses to overwrite
an existing file. Previous sign-in methods, sessions, and OAuth consents are revoked.
A superuser recovers ordinary users through a link in the admin interface.

<a id="ключи-oauth"></a>

## OAuth keys

Generate keys separately from the build:

```sh
node scripts/operations/create-oauth-keys.mjs .local-data/oauth-keys.json
```

Set `OAUTH_ISSUER_URL` and `OAUTH_KEYS_FILE` in Core's environment. The key path
must resolve from Core's working directory: for local runs from `apps/core`, use
`../../.local-data/oauth-keys.json`. Mount the private file separately in containers
and specify its container path. The command refuses to overwrite an existing
file; do not regenerate keys during upgrades.

<a id="диагностика"></a>

## Diagnostics

Optional [Sentry and local p95/p99 metrics](../features/monitoring.md) are configured
in system settings. Monitoring does not create Sentry alert rules, retention,
or dashboards; the operator configures those.

The reproducible API benchmark on a synthetic schema runs only when explicitly
enabled. From the repository root in PowerShell:

```powershell
$env:ASMBLYR_PERFORMANCE_AUDIT = "1"
node scripts/test.mjs core-performance
Remove-Item Env:\ASMBLYR_PERFORMANCE_AUDIT
```

The runner creates and removes a temporary local database. Local PostgreSQL with
CREATE DATABASE permission is required; a remote working database is rejected.
The test creates 40 collections and 20,000 records, measures listing, search,
and deep pagination with 1/8 concurrent requests, and reports p50/p95/p99,
SQL/request, and search plans. It uses Fastify inject without a browser or external
network, a superuser, and a simple schema. It does not establish a production SLO
or performance with complex permissions/relationships.

Compare overhead with `ASMBLYR_PERFORMANCE_MONITORING=disabled` or `enabled`.
Enabled mode uses the real Sentry SDK with an offline transport, API performance,
and SQL spans; network/Sentry delivery is not measured.
`ASMBLYR_PERFORMANCE_SAMPLE_RATE` sets trace sampling from 0 to 1 (default 1 in
the test). `ASMBLYR_PERFORMANCE_REPORT` writes JSON to the specified private path.
Remove test variables from the shell environment afterwards.

`/health` checks the process; `/ready` checks the database and required migrations.
Logs must not contain request bodies, tokens, or configuration secrets. Core's
environment controls retention; business change history is not automatically
deleted by default. Configure monitoring, external backups, recovery checks,
and alert delivery for your installation.
