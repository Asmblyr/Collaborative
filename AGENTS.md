# Asmblyr Collaborative: working rules

These rules apply to this repository. More specific instructions in an app
directory also apply to files in that app.

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
- In every schema-changing API operation, reject user-created or renamed
  table names with the reserved prefix and block alter, rename, or drop of
  Core-owned tables before executing DDL. Treat the prefix case-insensitively.
  Row operations are a separate concern.
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

## Plugin architecture: agreed contract

- Before changing plugin discovery, API handlers or assistant/MCP integration,
  read [the Kit contract](packages/kit/README.md) and
  [plugin actions](docs/design/plugin-actions.md). Follow working examples in
  `plugins/`; distinguish implemented contracts from proposals in design documents.
- Plugin HTTP handlers use H3 v2 and default exports in `server/api`.
  File paths and method suffixes such as `.get.ts` and `.post.ts` define routes.
  Use the existing source scanner and generated production route index.
- `plugin.ts` remains `definePlugin({})`. Do not register handlers, route lists
  or action arrays there, or introduce a parallel `server/actions` registry.
  Shared business logic belongs outside the scanned `server/api` directory.
- Expose model handlers with `defineModelContext<Input>(defineHandler(...), annotation)`
  and `defineModelAnnotation({ title, description, middleware: AccessGate.authenticated })`.
  The plugin builder generates runtime schemas from Input and the inner handler's
  result type, with supported JSDoc field constraints. Do not add hand-written
  schemas or registration to plugin.ts. Keep generated `.asmblyr/models` out of Git.
  HTTP, MCP and the assistant must invoke the same H3 handler, middleware,
  validation and authorization. Do not add a second implementation or a generic
  `/extensions/:namespace/actions/:action` execution route.
- MCP exposure is explicit through `defineModelContext`; plain handlers stay private
  to HTTP. `AccessGate` controls entry; `useItems(event)` uses caller permissions for
  data operations. MCP also restricts all operations and related paths to enabled
  collections, including for superusers. Never expose privileged storage/Knex to
  model handlers. `readOnly: true` must block writes through items, not just set a hint.
  Row permissions use explicit literal/context operands and direct scalar fields.
  Preserve each condition together with its field grant; never flatten conditional
  branches. HTTP, Kit and MCP share SQL scopes and transaction checks.
  See [access rules and current bounds](docs/features/access.md).
- The older `defineAction`/`defineActionContract` APIs are deprecated compatibility
  helpers. New plugins and examples use the typed model API. HTTP/MCP must retain
  the same validation, handler and native H3 middleware.
- Plugin capabilities are declared in `asmblyr.manifest.capabilities` and explicitly
  approved per npm package in the project's `asmblyr.pluginPermissions`. Missing
  means none. Keep capability checks separate from caller data permissions; neither
  grants a user additional rights. This is a trusted in-process contract, not a sandbox.
- Lifecycle hooks belong in `server/hooks/*.ts` with `defineHook`; settings belong
  in `server/settings.ts` with `defineSettings`. Do not add registries to `plugin.ts`.
  Follow [HOOKS.md](packages/kit/HOOKS.md): hooks run before commit in the mutation
  transaction; all context operations must be awaited. Keep external effects out
  of transactional hooks. Settings are validated and scoped to the owning package.
- Plugin UI uses the existing namespace HTTP proxy. Core-owned prepared-form
  retrieval remains separate; it is not another route for executing plugin logic.
- Plugin field editors register through `defineUiPlugin({ fieldInterfaces })` in
  the browser entry. Follow [the field contract](packages/kit/FIELDS.md): preserve
  the host draft and permissions, keep settings per field, and fall back to plain
  input/display when unavailable. Do not add plugin-specific branches to Core or
  built-in editors; UI options never replace server validation.
- A feature request does not implicitly replace an agreed architecture. If the
  current contract cannot support it, explain the concrete limitation and propose
  the contract change before implementing an alternative. Update documentation
  and examples together when that change is agreed.

## File size and ownership

- Optimize for reading: use named intermediate values for compound decisions,
  explicit branches for different scenarios, and one statement per line. Avoid
  nested ternaries and compressed multi-statement handlers.
- Exported parsers should have explicit return contracts. Separate untrusted
  input parsing, authorization, database work, and rendering at real boundaries.
- Use Prettier for edited code. Do not compress code to satisfy the file-size
  guideline; extract a cohesive responsibility when expansion reveals complexity.
- Separate logical steps with a blank line, such as input reading, validation,
  calculation, and return. Use braces for conditional branches, including early
  returns and throws. Keep related declarations together; do not add a blank line
  after every statement.
- Start object literals with a newline when their properties benefit from separate
  lines; Prettier preserves that layout. Its print width is a preference, not a hard
  limit, and it does not introduce logical grouping. Do not use `prettier-ignore`
  for ordinary code formatting.

- Give each source file one clear responsibility. Split along real boundaries
  such as route, service, repository, validation, or UI component, rather than
  splitting code just to meet a line count.
- At roughly 250 lines, review whether the file has acquired a second
  responsibility. Above 350 lines, split it or explain in the change summary
  why keeping it together is clearer. Generated files and cohesive migrations
  are exceptions.
- Avoid unrelated refactors and avoid leaving unused scaffolding after a
  design changes.

## Review and verification

- Self-review every change before reporting it: read the final diff, remove
  dead code, and check error paths, data safety, and compatibility with existing
  behavior.
- For schema or migration changes, check what happens on an existing database,
  whether data can be lost, and whether a rollback is safe. Do not run a
  destructive rollback on data that must be preserved.
- Run checks that cover the changed behavior. Use focused tests for meaningful
  logic, then typecheck, lint, or build when the change crosses app boundaries.
  Do not add tests that only repeat a trivial implementation.
- For plugin changes, review discovery in source and built packages, absence of
  duplicate registration, explicit MCP exposure, and HTTP/MCP permission parity.
  Use the focused [plugin review checklist](docs/design/plugin-actions.md#проверка-изменений).
- Report what changed, what was verified, and any remaining risk or decision.

## Documentation is part of the change

- Start from `docs/index.md` and the relevant `docs/features/` page. Current
  behavior lives in `guide`, `features`, `development`, `reference`, and `security`.
  `design`, `research`, `ideas`, and old `reviews` are historical evidence, not
  proof that a feature is implemented. Preserve their dates and conclusions.
- Update current documentation in the same change when modifying a feature,
  authorization boundary, route, SDK/Kit contract, configuration or migration.
  Describe implemented behavior, permissions, limits and verification separately
  from proposals. Never include real tokens, credentials or private user data.
- For HTTP changes, review `docs/reference/endpoints.json` against the handler
  AND the service. Keep `public` and the access description accurate. Add detailed
  contracts to `scripts/docs/http-contracts.mjs` where applicable. `route-only`
  is an explicit incomplete contract; never present it as a typed client schema.
- For SDK/Kit changes, edit public TypeScript and package guides. The documentation
  generator copies guides and runs TypeDoc; do not edit generated reference files.
  Keep examples aligned with the agreed H3/file-route/model-context architecture.
- Run `pnpm docs:generate` and `pnpm docs:check` for contract changes. Run
  `pnpm docs:build` after changing documentation structure, generators or public
  types; this must also pass before reporting a documentation task complete.
  Fix broken links instead of disabling dead-link checks. Review newly generated
  API coverage and preserve the explicit OAuth/plugin dynamic-route exclusions.
- Verify security claims with negative tests. The route catalog describes access;
  it does not enforce it. Run integration tests only through `scripts/test.mjs`
  against its disposable local database. Record passed, skipped and unverified
  scopes honestly in dated audits; do not silently refresh an old audit's date.
- For new findings, update the current limitation on its feature page and add a
  dated audit/review with source evidence, impact and the next concrete action.
  Documentation commands and ownership are in `docs/development/documentation.md`.

## Collaboration behavior

- Implement routine, reversible changes autonomously and show the finished
  result for review.
- Bring product contracts, database model choices, security boundaries, major
  dependencies, and other hard-to-reverse decisions to the user with a concrete
  recommendation and its tradeoffs. Use earlier decisions as authorization
  when they already settle the question.
- If a requirement is unclear, ask early and continue independent work while
  waiting. Do not add speculative code to fill the gap.
