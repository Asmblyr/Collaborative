<a id="локальная-разработка"></a>

# Local development

<a id="структура-репозитория"></a>

## Repository layout

| Directory                          | Responsibility                                                       |
| ---------------------------------- | -------------------------------------------------------------------- |
| `apps/core`                        | Fastify API, domain services, Knex, migrations, authentication       |
| `apps/ui`                          | Next.js admin pages and server rendering; Core owns sessions and API |
| `packages/contracts`               | Shared public types                                                  |
| `packages/sdk`                     | Typed HTTP client                                                    |
| `packages/cli`                     | SDK connection and type generation                                   |
| `packages/kit`                     | Server/browser plugin contracts and builder                          |
| `packages/plugin-comments`         | Discussion plugin installed by default                               |
| `packages/plugin-google-workspace` | Tools for personal Google connections                                |
| `examples/plugins`                 | Examples disabled by default                                         |
| `deploy`, `docs`, `scripts`        | Deployment, documentation, checks                                    |

The [architecture](./architecture.md) shows request and data paths.

<a id="запуск-и-изменения"></a>

## Running and changing the application

Use Node.js 22+, pnpm 11.13.1, and Docker Compose. Complete
[first-time setup](../guide/getting-started.md), then work with `pnpm dev`.
This builds packages and starts Core and UI. Core watches plugin routes in local
workspace packages. Changing the installed package list requires restarting both
Core and UI. Rebuild UI and packages for production.

Change Core schemas with a new versioned migration in `apps/core/migrations`.
Custom collections live in `public`; `asmblyr_` and `plugin_` names are reserved.
Run existing-installation migrations through `pnpm db:migrate`. Check data,
permission, and file access in Core services, not just UI. Current rules are in
[policies](../features/access.md) and the [access matrix](../security/access-matrix.md).

<a id="проверки"></a>

## Checks

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm docs:build
pnpm build
```

Run integration tests **only** through `node scripts/test.mjs` and its disposable
database. The runner needs local PostgreSQL and `TEST_DATABASE_ADMIN_URL` with
`CREATEDB`. `pnpm check` combines publication checks, formatting, types, lint,
tests, and documentation; the full suite can take time. Generated reference
updates are explained in the [documentation workflow](./documentation.md).

Before opening a pull request, read
[CONTRIBUTING.md](https://github.com/Asmblyr/Collaborative/blob/main/CONTRIBUTING.md).
See [operations](./operations.md) for health/readiness checks, logs, and backups.
