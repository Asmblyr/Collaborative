# Repository rules

## Scope and architecture

- Work inside this repository. Do not change sibling Asmblyr projects as part of
  this product.
- Keep `apps/core` responsible for the HTTP API and database access, and
  `apps/ui` responsible for the administration interface.
- Keep route handlers and UI pages thin. Put reusable domain logic in focused
  modules near the feature that owns it; keep database queries separate from
  request parsing and presentation.
- Add abstractions when a concrete feature needs them. Do not build guards,
  registries, or extension points solely for hypothetical future routes.
- Core-owned and user-created tables share the `public` PostgreSQL schema.
  Reserve the `asmblyr_` prefix for Core-owned tables, including migration
  bookkeeping tables. Core structure belongs in versioned Knex migrations.
  Preserve existing migration source, including formatting; add a new migration
  for schema changes.
- In every schema-changing API operation, reject user-created or renamed
  table names with the reserved prefix and block alter, rename, or drop of
  Core-owned tables before executing DDL. Treat the prefix case-insensitively.
  The dedicated system-collections service is the narrow exception: it may add,
  configure or remove explicitly registered custom columns on its allowlisted
  product entities. Built-in columns and whole tables remain protected; ordinary
  collection/item routes must not adopt these tables. Row operations are separate.
- Plugin-owned collections use `public.plugin_<namespace>_<local_name>`. Reserve
  `plugin_` in user schema operations, including when the owning package is disabled.
  Ownership and installed declarations live in Core's plugin registry. Initial
  installation is transactional; changes to installed definitions require explicit
  versioned migrations. Never adopt an existing unowned table or remove data when
  disabling a package. Plugin row access uses the ordinary items authorization.
- `items` always uses caller permissions. Request-bound `storage` is a trusted
  plugin capability limited to its owned collections; endpoints must check domain
  authorization first. Neither exposes SQL or actor overrides. Plugin migrations
  are immutable additive plans; UI imports only the separate `./ui` browser entry.
- Use `/collections` for collection structure and `/items/:collection` for
  data. Keep PostgreSQL table names inside the database layer.
