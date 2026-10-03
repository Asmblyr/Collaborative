# Repository rules

## Plugin architecture: agreed contract

- Before changing plugin discovery, API handlers or assistant/MCP integration,
  read [the Kit contract](../../packages/kit/README.md) and
  [plugin actions](../../docs/development/plugin-actions.md). Follow working examples in
  `packages/plugin-comments` and `examples/plugins`. Public guides describe the
  current contract; private proposals do not replace it.
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
  See [access rules and current bounds](../../docs/features/access.md).
- The older `defineAction`/`defineActionContract` APIs are deprecated compatibility
  helpers. New plugins and examples use the typed model API. HTTP/MCP must retain
  the same validation, handler and native H3 middleware.
- Plugin capabilities are declared in `asmblyr.manifest.capabilities` and explicitly
  approved per npm package in the project's `asmblyr.pluginPermissions`. Missing
  means none. Keep capability checks separate from caller data permissions; neither
  grants a user additional rights. This is a trusted in-process contract, not a sandbox.
- Lifecycle hooks belong in `server/hooks/*.ts` with `defineHook`; settings belong
  in `server/settings.ts` with `defineSettings`. Do not add registries to `plugin.ts`.
  Follow [HOOKS.md](../../packages/kit/HOOKS.md): hooks run before commit in the mutation
  transaction; all context operations must be awaited. Keep external effects out
  of transactional hooks. Settings are validated and scoped to the owning package.
- Plugin UI uses the existing namespace HTTP proxy. Core-owned prepared-form
  retrieval remains separate; it is not another route for executing plugin logic.
- Plugin field editors register through `defineUiPlugin({ fieldInterfaces })` in
  the browser entry. Follow [the field contract](../../packages/kit/FIELDS.md): preserve
  the host draft and permissions, keep settings per field, and fall back to plain
  input/display when unavailable. Do not add plugin-specific branches to Core or
  built-in editors; UI options never replace server validation.
- A feature request does not implicitly replace an agreed architecture. If the
  current contract cannot support it, explain the concrete limitation and propose
  the contract change before implementing an alternative. Update documentation
  and examples together when that change is agreed.
