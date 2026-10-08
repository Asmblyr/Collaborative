<!-- Generated from packages/kit/LIFECYCLE.md; edit the source. -->

<a id="миграции-хранилище-и-ui-плагина"></a>

# Plugin migrations, storage, and UI

<a id="миграции"></a>

## Migrations

`server/migrations/YYYYMMDDHHmmss_name.ts` files export defineMigration. `package.json` needs "./migrations": "./dist/migrations.json".

```ts
import { defineMigration } from "@asmblyr-collaborative/kit";

export default defineMigration({
  operations: [
    {
      type: "addField",
      collection: "entries",
      name: "author_id",
      field: { type: "uuid", required: false, nullable: true },
    },
    {
      type: "addIndex",
      collection: "entries",
      name: "by_author",
      fields: ["author_id"],
    },
  ],
});
```

Update the current server/collections declaration too. Migrations are immutable JSON plans; checksums do not depend on TS-to-JS compilation. Never import mutable current declarations into old migrations. Supported operations are addField and ordinary composite B-tree addIndex. SQL, drop, type changes, renames, backfills, and automatic down are unsupported. Adding NOT NULL without a default to populated data fails in PostgreSQL and rolls back.

Core applies new plans by filename under a shared lock. Operations accept only local names of owned collections. Asmblyr_plugin_migrations records name, SHA-256 plan hash, timestamp, and baseline flag. Editing/removing applied plans or inserting a plan before an applied one is forbidden. Operation failures or final-declaration mismatch roll back the full installation: DDL, metadata, and journal.

New installations create current declarations, validate addField, create indexes, and baseline plans. New tables in existing plugins also use current schemas. Removing declarations is unsupported. Disabling never deletes data; registry down is blocked while history exists. Direct SQL changes do not synchronize automatically.

<a id="собственное-хранилище"></a>

## Own storage

Authenticated namespaced handlers with storage.own receive storage. List/get/create/update/delete follow items shapes but accept local names, such as storage.list("entries"). Access is restricted to that package. No SQL, Knex, commit, actor switching, or foreign namespace access. Core validation, actual-actor history, and write transactions apply.

This is privileged access by a trusted plugin to its own storage. Ordinary items keeps user permissions. Plugins must enforce domain rules first: Comments reads the target through items.get before accessing comments storage, so users need no grants on comment tables.

Direct /items/plugin\_… remains an administrative path under ordinary grants. Granting it bypasses specialized endpoint rules and is unnecessary for discussion participants. Plugin code is trusted in Core, without a sandbox. Storage cannot access user collections.

<a id="типизированное-хранилище"></a>

## Typed storage

Use the declaration for typed access:

```ts
import { useStorage } from "@asmblyr-collaborative/kit";
import entries from "./server/collections/entries.js";

const comments = useStorage(context, entries);
const row = await comments.get(id);
// row.body, row.author_id, and other fields are inferred from entries.
```

Get/create/update return the row itself; list returns { data, labels, page }. DefineCollection infers names/types, required create fields, nullability, and manual primary keys. Defaults allow omission on create. Generated keys/timestamps cannot be supplied to typed writes.

Dates normalize to ISO strings; decimal/bigint remain strings. Read values inconsistent with declarations throw instead of coercing. Core still owns validation/scope. This API reads full rows; use context.storage for projections. Never retain it across requests.

<a id="вкладки-редактора-записи"></a>

## Record-editor tabs

Ui/index.ts exports defineUiPlugin({ recordPanels: [...] }) from @asmblyr-collaborative/kit/ui, with its build exported as ./ui. Do not import root Kit/plugin.ts into browsers. Panels define id, title, React component, and optional supports(record).

RecordPanelProps includes:

- Record: technical collection name, saved ID, display name.
- Request&lt;T&gt;(path, init): authenticated namespace request under /api/&lt;namespace&gt;/….
- OnStateChange({ dirty, busy }): protects unsaved text and active writes from closing.

Import shadcn directly from kit/ui/&lt;component&gt;. Admin/plugins share full props/refs, without extra providers or components props. See [shared UI](kit-ui.md).

Panels mount on first open and persist across tab changes. Render failures are isolated from the record form. New unsaved records have no panels. Active packages are checked through authenticated /extensions.

Next generates static imports and Tailwind sources from enabled exports at startup/build. Development reads ui/index.ts; production/npm use built ./ui. Package-list changes require dev restart or production UI rebuild; TSX uses Fast Refresh. React is a peer dependency. Use .ts/.tsx relative imports with rewriteRelativeImportExtensions:true, and include ui/**/\* and shared/**/\*.

Packages/plugin-comments is the complete example. Server packages must never enter UI imports.

<a id="отдельные-страницы"></a>

## Standalone pages

Examples/plugins/overview demonstrates pages, which can coexist with record panels.

```ts
import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";
import { OverviewPage } from "./pages/overview-page.tsx";

export default defineUiPlugin({
  pages: [{ id: "home", title: "Overview", component: OverviewPage }],
});
```

Routes use /extensions/&lt;namespace&gt;/&lt;id&gt;. The host adds pages under Applications, shows their title, and uses the current layout. IDs must be URL-safe and unique within each extension kind; a page/panel may share an ID.

PluginPageProps.request is the same namespace-limited HTTP client. Shared Button/Textarea come from Kit. The shell isolates render errors. Authenticated /extensions supplies enabled packages to layout, menu, pages, and panels.

Users must satisfy existing admin admission rules. Separate page permissions are unsupported; each plugin API enforces its domain rights. Missing/disabled plugins are hidden. Enabling requires rebuilding/restarting UI and Core.

Only fixed pages are supported, without nested/dynamic routes. Pages also receive preparedAction/onStateChange. UseAction(contract, props, { path, initialInput }) connects form schema, ordinary requests, prepared results, and dirty/busy host state. Overview reads only the current caller's context. See [field editors](kit-fields.md).

<a id="деиствия-и-ассистент"></a>

## Actions and assistant

Examples/plugins/calculator declares input/output in TypeScript. Its static POST handler uses defineModelContext&lt;CalculationInput&gt;(defineHandler(...), annotate), with defineModelAnnotation and AccessGate.authenticated.

Builder/source loader produce .asmblyr/models for runtime validation/UI; enable resolveJsonModule for JSON imports. File discovery registers HTTP; Core exposes annotated handlers to internal MCP. `plugin.ts` stays definePlugin({}).

HTTP/MCP share one restricted handler context. `useActionContext` exposes actor, superuser, signal, and items. UseItems works in ordinary endpoints too, checking actions/fields. MCP additionally checks publication of collections/relations. Model handlers receive no privileged storage. ReadOnly:true blocks all items writes.

Forms use useAction&lt;Input, Output&gt;(generatedModel, props, options), deriving browser/server schemas from the same types without importing server handlers. See [action contracts](../development/plugin-actions.md).

<a id="возможности-hooks-и-настроики"></a>

## Capabilities, hooks, and settings

Declare manifest capabilities and approve them in asmblyr.pluginPermissions. See [capabilities](kit-capabilities.md). Transactional server/hooks and server/settings.ts are covered in [hooks/settings](kit-hooks.md). No registration in plugin.ts is required.
