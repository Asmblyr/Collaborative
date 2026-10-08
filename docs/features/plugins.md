<a id="расширения"></a>

# Plugins

Plugins are npm or workspace packages explicitly listed in the root `asmblyr.plugins` configuration. A directory name alone does not install a plugin. Installing packages through the UI is not supported.

Settings shows a list of plugins. Clicking one opens its right-side editor with capabilities and settings. Closing a dirty editor requires confirmation; closing is blocked during save. Plugins without configurable parameters still expose their capability view.

<a id="контракт"></a>

## Package contract

- `plugin.ts` uses `definePlugin`; there is no manual route registry.
- `server/api/**/*.get.ts`, `*.post.ts`, and other method suffixes define H3 v2 file routes.
- `server/hooks` and `server/settings` provide hooks and settings.
- The `./ui` entry contains browser code.
- Model-visible handlers require an explicit `defineModelContext` annotation.

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
