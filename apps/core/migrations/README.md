# Core migrations

## Presence (2026-10-03)

`20261003050000_presence` creates `asmblyr_presence` with session/view keys,
scope/expiry indexes and a cascading auth-session reference. Existing collections,
records, history and credentials are unchanged. Down discards only transient
online indicators. Heartbeats prune expired leases; no separate worker is needed.
Applied to the existing local development database as batch 51.
No destructive rollback was run on the development database.

## Plugin collection ownership (2026-10-02)

`20261002050000_plugin_collections` adds `asmblyr_plugins` and
`asmblyr_plugin_collections`. This migration only creates the ownership registry;
Core installs enabled plugins' declared tables during startup in a separate
transaction. Existing application data is unchanged. Down refuses to remove the
registry while any plugin collections are registered. Disabling a plugin does
not run down or delete its tables. Namespace/package changes and changed or removed
declarations require explicit migrations.

`20261002060000_plugin_migrations` creates the per-plugin upgrade ledger. Core
executes pending additive plans in its startup installation transaction, validates
the resulting declaration, and records immutable plan checksums. Fresh installs
baseline the current declarations while still creating indexes. Failure rolls
back schema, metadata and ledger together. Down refuses to discard recorded
history. Plugin down, rename/drop/type changes and backfills are not implemented.
Existing comments receive nullable author fields; historical authors stay unknown.
This Core migration was applied locally as batch 46.

## Extended fields, saved views and workspaces (2026-09-30)

- `20260930030000_extended_fields`: expands semantic types to file/files and adds
  the indexed reference table. Existing collections and rows are unchanged.
- `20260930040000_views_and_workspaces`: adds personal table views, shared
  workspaces, collection membership and personal selection. Foreign keys have
  indexes; membership/view cleanup cascades without deleting collection data.
- `20260930050000_structured_defaults`: expands the existing default JSONB CHECK
  to arrays/objects. SQL NULL still means no default; Core validates field types.

These migrations were applied to the existing development database as batches
27–29. Down migrations refuse to discard configured extended fields, references,
views, workspaces or structured defaults. No destructive rollback was run.

## General rules

Put versioned Knex `.cjs` migrations for Core-owned tables here. Core-owned
tables use the `asmblyr_` prefix in the `public` schema. The collections
metadata migration must not be rolled back while user collections exist.
The field metadata migration must not be rolled back while semantic fields exist.
The required/nullable migration copies the old `NOT NULL` rule into API-level
`required` metadata. Its rollback refuses to discard any rule that differs from
the physical column constraint.
The collection options migration gives existing collections the original
multiple-record, UUID `id` defaults. Its rollback refuses to discard custom
mode, key, or timestamp settings.
The field defaults migration adds nullable JSON metadata; existing fields
retain their current behavior. Its rollback refuses to discard configured
defaults.
The item events migration assigns stable UUIDs to existing collections and
creates the API item history table. Events intentionally do not reference
collection metadata with a foreign key, so history survives collection
deletion. Its rollback refuses to discard recorded events.
The local auth migration adds users, Argon2id credentials, sessions, and
hashed access/refresh tokens. Its rollback refuses to discard users.
The superuser migration renames `is_admin` to `superuser`, preserving existing
values. Its rollback renames the column back without changing data.
The policies migration adds named policies, collection/action/field permissions,
and user assignments. It deliberately has no item filters yet. Collection
deletion removes its permissions, and rollback refuses to discard policies.
The shared permissions migration moves existing policy links into
`asmblyr_policy_permissions` and keeps permission IDs. Its rollback refuses to
collapse permissions that have multiple policies, no policy, or duplicate
collection/action scopes within one policy.
The filter presets migration creates per-user, per-collection saved filters.
Collection or user deletion removes their presets. Its rollback refuses to
discard saved filters.
