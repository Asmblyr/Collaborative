# Core migrations

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

This directory contains versioned Knex `.cjs` migrations for Core-owned tables.
Core uses the `public` PostgreSQL schema and reserves the `asmblyr_` table prefix,
including the `asmblyr_migrations` bookkeeping table.

## Running migrations

Configure `DATABASE_URL` in `apps/core/.env` or the process environment, then run
from the repository root:

```sh
pnpm db:status
pnpm db:migrate
```

For a deployed installation, follow the backup and upgrade instructions in the
[operations guide](../../../docs/development/operations.md). Back up the database
and file storage together before an upgrade.

`pnpm db:rollback` rolls back the latest batch. Several migrations refuse to
remove tables or metadata while application data depends on them. Inspect the
specific `down` implementation and test a rollback on a disposable database
before using it on an installation you need to preserve.

## Adding migrations

- Add a new timestamped `.cjs` file with `up` and `down` exports. Preserve existing
  migration files, including formatting; deployed databases have already run them.
- Keep schema changes transactional. Account for existing rows, foreign keys,
  indexes and default values.
- Use additive changes when possible. Do not silently discard configured fields,
  permissions, accounts, history or user data during rollback.
- Test both a fresh installation and an upgrade from the previous schema using a
  disposable database. The repository test runner creates and removes its own
  test database; see [CONTRIBUTING](../../../CONTRIBUTING.md).

Plugin-owned collections use `plugin_<namespace>_<local_name>` and have a separate
installation and upgrade ledger. Define their additive migrations in the owning
plugin package; see the [plugin contract](../../../docs/development/plugin-actions.md).
Disabling a plugin does not remove its collections or run a rollback.
