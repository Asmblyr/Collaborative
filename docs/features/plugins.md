<a id="расширения"></a>

# Plugins

Plugins are npm or workspace packages explicitly listed in the root `asmblyr.plugins` configuration. A directory name alone does not install a plugin. Installing packages through the UI is not supported.

Settings → Extensions shows configured packages with search, status and category filters, compatibility, dependencies, capabilities, operation history and settings. Clicking one opens its detail editor. Closing a dirty settings editor requires confirmation; closing is blocked during save. Plugins without configurable parameters still expose their capability view.

An administrator with `plugins/update` may enable or disable a configured package. The API saves `desiredState` and reports `pendingRestart`; existing routes and hooks remain loaded until Core restarts. Startup reconciles the desired state and reports `actualState`, `lastError`, and the serving Core `instanceId`. A dependency conflict or missing capability approval blocks enablement. No plugin data is deleted on disable. Reading the center requires `plugins/read` or `plugins/update`.

Installation, version updates and uninstallation require a trusted deployment change to the root package allowlist, lockfile and artifacts. Core never installs arbitrary npm packages from an API request. There is no remote marketplace or version feed, so the center shows only the installed package version and cannot claim updates are available.

<a id="контракт"></a>

## Package contract

- `plugin.ts` uses `definePlugin`; there is no manual route registry.
- `server/api/**/*.get.ts`, `*.post.ts`, and other method suffixes define H3 v2 file routes.
- `server/hooks` and `server/settings` provide hooks and settings.
- The `./ui` entry contains browser code.
- Model-visible handlers require an explicit `defineModelContext` annotation.

The existing `asmblyr.manifest.version: 1` contract remains valid. Optional registry metadata in `package.json` includes `title`, `description`, `category`, `publisher: { id, name }`, `compatibility: { collaborative, node? }`, `dependencies` and `optionalDependencies`. Versions and ranges use semantic versioning. The package's `name` and `version` are the identity and installed version; old versionless v1 fixtures resolve to `0.0.0` for compatibility. Required dependencies must be configured, version compatible, enabled and acyclic. Optional dependencies do not block activation. See [registry architecture](../architecture/extension-registry.md).

The trusted Comments package demonstrates the existing `definePlugin({})`, file routes, hooks and settings with manifest version 1; no new registration file is required.

Kit is the server/browser extension API. SDK is an HTTP client, not access to Knex. `useItems` keeps the caller's permissions. `storage.own` provides privileged access to the plugin's own tables; the plugin must enforce its domain permissions.

Annotated model handlers expose schemas through `GET /schema`, filtered by AccessGate. Generated clients call `client.plugins.namespace[methodId](input)` over HTTP. Runtime data and OAuth checks still apply. Legacy handlers without output schemas are excluded from generation.

<a id="декларации-и-установка"></a>

## Capabilities and storage

A capability must be declared in the manifest and approved in `pluginPermissions`. None are granted by default. This mechanism is not a Node.js sandbox.

First installation creates tables transactionally under reserved `plugin_<namespace>_<local>` names. A plugin cannot adopt someone else's table. Versioned migrations are immutable. Disabling a plugin preserves its data.

All product packages use the `@asmblyr-collaborative` scope. Existing installations must update dependency names, `asmblyr.plugins`, and permission keys, then run install, migrations, and build before starting Core and UI. Migration `20261005220000_collaborative_package_names` updates only known registry owners, validates namespace/conflicts, and leaves third-party plugins unchanged.

Namespaces, comment/Google tables, settings, history, URLs, and the `asmblyr` configuration key stay compatible. The old `@asmblyr/kit` name in a historical Comments migration is retained because migrations are immutable.

<a id="названия-и-видимость"></a>

## Names and visibility

Plugin names come from their locale catalogs. `GET /settings/plugins` falls back from Russian `settings.title` to the settings title and then the technical name. Once the selected locale loads, the UI refines the label. This works for plugins without UI or settings. Namespaces and npm identifiers remain unchanged.

Plugin-owned tables are hidden from `/admin/collections`, including its counts. They remain available to permitted APIs and plugin pages; hiding them does not change authorization.

<a id="hooks-и-уведомления"></a>

## Hooks and notifications

Before-commit hook failures roll back the transaction. External requests do not guarantee delivery; reliable delivery requires an outbox, which is not implemented. Await every context operation.

The `notifications` capability supports discussion subscriptions and the core bell in the same transaction. Core selects recipients without granting extra access.

See [Kit](../reference/kit-guide.md), [hooks](../reference/kit-hooks.md), and [fields](../reference/kit-fields.md). Discovery must behave consistently in source and built package indexes.

<a id="граница-доверия"></a>

## Trust boundary

Server plugins run with Core's Node.js and environment access. Browser plugins run in the admin's context. Untrusted plugins require separate process or browser isolation.

The extension center reads only configured package metadata. It cannot execute untrusted packages, grant new capabilities, or edit project package approvals. The current settings schema contains ordinary values; do not place secrets there. Secret fields require an external secret store and a new contract. Health reports the serving process, validation issues, startup errors and pending restart; it does not probe external services or aggregate replica health. The history endpoint records activation and startup outcomes without settings values. See [registry architecture](../architecture/extension-registry.md).

If Core fails before startup because a package cannot be resolved or imported, inspect the server error, restore the trusted package artifact or configuration, and restart. If an enable request returns a dependency conflict, enable its required packages first or install a compatible trusted version through the deployment process. After changing desired activation, restart Core and refresh the center to verify the loaded state.

## Upgrade and local verification

Existing v1 manifests and `asmblyr.plugins` entries remain valid. Apply the additive migrations before starting the new Core so it can read activation state. The first creates `asmblyr_extension_states` and `asmblyr_extension_history`; the second allows process startup events with nullable actor and instance ID. Empty state means every configured package remains enabled. They do not alter plugin tables or settings. A rollback refuses to discard nonempty activation or runtime history.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
pnpm dev
```

Sign in with `plugins/read` to inspect Settings → Extensions. With `plugins/update`, disable a trusted package, confirm the pending restart status, restart Core and check that it is disabled. Re-enable and restart again to restore its routes. [SDK](../reference/sdk-guide.md) and [CLI](../reference/cli-guide.md) use the same Registry API. The [HTTP reference](../reference/http.md) includes the typed route contracts.
