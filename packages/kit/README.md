# @asmblyr-collaborative/kit

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

Typed API for Collaborative plugins.

[Capabilities and permissions](CAPABILITIES.md) · [Hooks and settings](HOOKS.md)

Plugins can also supply [text-field editors](FIELDS.md), field settings, and table displays. See examples/plugins/color.

Kit contains server context, H3 handlers, and the plugin builder. The browser/Node HTTP client is the separate [SDK](../sdk/README.md). Shared request/response types belong to @asmblyr-collaborative/contracts; Kit re-exports those needed by handler authors.

The required root plugin.ts currently stays minimal:

```ts
import { definePlugin } from "@asmblyr-collaborative/kit";

export default definePlugin({});
```

Routes are discovered under server/api and are not listed manually in plugin.ts. The same principle applies to the assistant/MCP: defineModelContext&lt;Input&gt; connects an existing H3 handler to defineModelAnnotation. The builder derives schemas from TypeScript. See [plugin actions](../../docs/development/plugin-actions.md).

<a id="обработчик"></a>

## Handlers

server/api/comments/status.get.ts:

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";

export default defineHandler((event) => {
  const { actor, logger } = useAsmblyr(event);
  logger.info("Status requested", { actorId: actor.id });
  return { data: { status: "scaffold" } };
});
```

- `defineHandler` re-exports H3 2.0.1-rc.32 and receives H3Event. Import HTTP utilities from h3 with the same pinned dependency. H3 v1 is incompatible.
- `useAsmblyr`(event) returns validated actor (id, kind, optional displayName), requestId, logger, items, and approved capabilities. Storage needs namespace/storage.own; displayName needs identity.profile. Calls outside Core context fail.
- Notifications capability adds subscriptions and inbox publication within the plugin namespace. Core selects recipients and checks record access. See [capabilities](./CAPABILITIES.md).
- Core authenticates humans/services before reading the body or invoking handlers. There are no anonymous endpoints. Authorization and session/provider cookies are removed from plugin requests.
- Read parameters/query with H3 getRouterParam, getQuery, or getValidatedQuery. Decode a parameter once with decode:true. Read bodies with event.req.json/text/formData or readValidatedBody. Generics do not validate input.
- Return objects, strings, bytes, Response, streams, or Promises. Set status/headers through event.res or Response. Strings are text; JSON strings require Response.json(value). Null/undefined mean an empty body; objects remain JSON.
- H3 HTTPError and Collaborative EndpointError are supported. Errors share code/message/requestId; server details stay in logs. Client HTTPErrors retain headers.
- Authentication grants no collection access. Items checks actions/fields through Core's shared /items logic.
- UseItems(event) works in ordinary endpoints and model handlers. `useActionContext` adds actor, superuser, and signal, but excludes full useAsmblyr and privileged storage. AccessGate authenticates; each items method authorizes data. MCP additionally checks publication of all affected collections.

These are trusted in-process server packages, not sandboxed code.

<a id="чтение-данных"></a>

## Reading data

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";

export default defineHandler(async (event) => {
  const { items } = useAsmblyr(event);
  return items.list("articles", {
    fields: ["id", "title"],
    limit: 20,
    page: 1,
    sort: "title",
    direction: "asc",
  });
});
```

Read one record with items.get("articles", 4, { fields: ["title"] }). Kit calls Core's in-process service without extra HTTP.

| Method                              | Result                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| items.list(collection, options?)    | { data, labels, page: { number, size, total, sort, direction, order } } |
| items.get(collection, id, options?) | { data, label }; missing records return 404                             |

Kit exports ItemsReader, ItemListOptions, ItemReadOptions, ItemListResult, ItemResult, ItemRecord, and filter types.

- Collection/fields use technical names. Selection covers physical columns, foreign keys, and timestamps, without relation expansion or virtual fields.
- Omitted fields returns all permitted fields. An empty list returns only the primary key, which is always included. No "\*" is needed. Closed fields yield 403; unknown fields 400. SQL performs projection.
- Sorting/search/filtering use all permitted fields independently of projection. You can return id while sorting by accessible title. Labels may use permitted fields outside selection, never closed fields in source/related collections.
- Page starts at 1; limit is 1–100, default 100; total is a string. Without search or explicit sorting, the primary key orders results. Search relevance follows Core's order option.
- IDs are strings or safe JS integers. Large bigserial IDs remain strings. Dynamic fields have unknown type. Date stays YYYY-MM-DD, bigint stays an exact decimal string. Datetime may be Date inside handlers, becoming ISO on JSON serialization.
- Q/filter use HTTP operators and checks. Values are strings/string arrays, including numbers/booleans. Related filters allow one hop with access to both sides. Limits: 8192 JSON characters, 3 group levels, 20 conditions, 30 nodes.
- Grants load at endpoint entry. Policy/session/key revocation applies on the next request. Never store items globally or use it in background tasks.
- Actors, superuser, and grants cannot be overridden. Unknown read options are rejected. Items exposes no Knex, tokens, or system tables; plugin code remains trusted.
- Core applies row permissions before count/pagination, separately from caller filters. Matching rules control projection and original/final write checks. See [access boundaries](../../docs/features/access.md). Record statuses are not implicitly filtered: callers supply the condition as with /items.

Example with a readable related field:

```ts
const result = await items.list("articles", {
  fields: ["title"],
  filter: {
    logic: "and",
    children: [{ field: "author_id.name", op: "eq", value: "Anna" }],
  },
});
```

Errors remain errors: 400 invalid request, 403 denied, 404 missing collection/record, and 401 invalid token before invocation. They never become empty results.

HTTP uses the same projection: GET /items/articles?fields=id,title and GET /items/articles/4?fields=title. Omitting fields preserves its response format.

<a id="запись-данных"></a>

## Writing data

```ts
const { items } = useAsmblyr(event);
const result = await items.create("articles", { title: "Article" });
await items.update("articles", 4, { title: "New title" });
await items.delete("articles", 4);
```

ItemsService includes reads/writes; ItemsReader remains a separate type for read-only consumers. Inputs are JSON objects validated by Core's field/relation rules.

- Create/update return readable data, or data:null on successful write without read access. Delete returns void.
- Shared items/writer.ts performs authorization, related-collection checks, validation, storage, and projection.
- Each operation/history is transactional. The caller supplies authorship; Core generates a separate UUID history-operation ID, distinct from HTTP requestId.
- Multiple calls do not share a transaction. Items.commit(collection, draft) atomically saves linked drafts, returning the root ID and rolling back all changes/history on failure.
- ItemCommitDraft contains values/references/relations/records, capped at 100 changes/depth 5. Existing records in commits also require reads. ExpectedValues on each modified record includes baselines for updated fields/FKs; Core checks under row locks. Mismatch returns ITEM_CHANGED (409) and rolls back everything. Compared fields need read/update; omission preserves legacy behavior. See [SDK writes](../sdk/README.md#writes-and-relationships).
- Errors: 400 invalid values/fields, 403 access, 404 missing record, 409 relationship/key conflict or a second singleton record.

Core installs plugin-owned collections on first startup; declaration/update rules follow below.

<a id="пример-post-с-проверкои-тела"></a>

### POST body validation

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import { readValidatedBody } from "h3";

export default defineHandler(async (event) => {
  const body = await readValidatedBody(event, (value: unknown) => {
    if (!value || typeof value !== "object" || !("text" in value)) return false;
    if (typeof value.text !== "string" || !value.text.trim()) return false;
    return { text: value.text.trim() };
  });
  return { data: { text: body.text, actorId: useAsmblyr(event).actor.id } };
});
```

<a id="граница-http"></a>

### HTTP boundary

Fastify routes requests. An isolated parser reads raw bodies up to 1 MiB; H3 parses once. Multipart fits within that limit; large streaming uploads are unsupported. Responses stream through Fastify without JSON conversion/full buffering. Disconnect reaches event.req.signal.

Core preserves content type, status, plugin cookies, and end-to-end headers. Cookie names prefixed asmblyr\_ or SESSION_COOKIE_PREFIX are reserved; plugins cannot read/replace session/provider cookies. Redirects go to the browser without a server-side follow carrying Core credentials. Use public Location values such as /api/comments/status.

There is no intermediate UI proxy timeout; clients control cancellation. All plugin responses use Cache-Control:no-store.

This integrates H3 handlers, not a full Nitro server. Event.app, raw Node req/res, WebSocket upgrades, and background lifecycle are unavailable. H3's definePlugin is a different API from Collaborative's package declaration.

<a id="адреса"></a>

## Addresses

Paths are relative to server/api; suffixes determine methods.

| File under server/api              | Public admin-domain route     |
| ---------------------------------- | ----------------------------- |
| comments/index.get.ts              | GET /api/comments             |
| comments/index.post.ts             | POST /api/comments            |
| comments/[id].delete.ts            | DELETE /api/comments/:id      |
| comments/[id]/replies/index.get.ts | GET /api/comments/:id/replies |

Core also uses these paths without /api. Npm package names are not inserted in URLs. Supported suffixes: get/post/put/patch/delete.ts. A file without a method suffix serves all five. Every route default-exports a handler.

Keep helpers outside server/api. Declaration files are not routes. Optional parameters, catch-all, compound path segments, and separate HEAD/OPTIONS handlers are unsupported.

The first path segment belongs to the plugin. Core rejects collisions with built-in sections, other plugins, and duplicate routes. Builds reject ambiguous files such as [id].get.ts and [key].get.ts in one directory. Browser calls use the public API with the current session and the existing mutation Origin checks.

<a id="коллекции-плагина"></a>

## Plugin collections

Comments' server/collections/entries.ts demonstrates defineCollection. Core validates declarations and creates tables/metadata on initial startup. Files sit directly under server/collections and match local collection names. Subdirectories/symlinks are forbidden.

```ts
import { defineCollection } from "@asmblyr-collaborative/kit";

export default defineCollection({
  name: "entries",
  primaryKey: { name: "id", type: "uuid" },
  timestamps: { createdAt: true, updatedAt: true },
  presentation: { displayName: "Comments", hidden: true },
  fields: {
    body: {
      type: "text",
      required: true,
      nullable: false,
      presentation: { label: "Comment", interface: "textarea" },
    },
  },
});
```

- Name is local to the plugin. Manifest namespace produces plugin*&lt;namespace&gt;*&lt;name&gt;, such as plugin_comments_entries.
- PrimaryKey/timestamps use shared Contracts types; do not duplicate them in fields.
- Field keys are technical names; declaration order determines column creation order. Installation persists metadata.
- Required means nonempty API input; nullable permits SQL NULL. Both are explicit/independent, including true/true.
- Types match Core. DefaultValue depends on type; date/bigint use strings, including CollectionRow/storage input. File/files have no defaults. Searchable supports text/email and does not itself declare an index.
- Field presentation uses FieldPresentation with optional settings. Collection presentation currently supports displayName/hidden. Navigation hiding is not authorization or structural protection.
- DefineCollection is side-effect-free and not a runtime validator. Core uses shared validators for names, values, interface combinations, and field conflicts.

Packages with collections specify a namespace and export ./collections as ./dist/collections.json. Namespace is 1–31 lowercase Latin letters/digits/underscores, beginning with a letter, unique among installed packages. Asmblyr and asmblyr*/plugin* prefixes are reserved. Full table names must fit PostgreSQL's 63-character limit.

The builder generates the declaration index. Development scans local source; production loads indexes/compiled modules. `plugin.ts` remains empty.

Core stores namespace/npm ownership in asmblyr_plugins and local/physical names plus normalized declarations in asmblyr_plugin_collections. Normal Core migrations create the registry. Startup installs all enabled collections in one transaction under a shared lock. Foreign tables/metadata are never adopted; restarting preserves data.

Installed declaration changes require explicit server/migrations reproducing the new state. Mismatch stops startup. New collections install automatically. Missing registered tables are not silently recreated. Direct SQL structure edits do not synchronize automatically. Disabling a plugin preserves tables/ownership.

Plugin\_ remains reserved in UI/API whether the package is enabled or not. Neither ordinary users nor superusers edit these collections' structure/settings. Rows use normal /items/Kit grants and history; disabling plugin code does not revoke those grants. MCP starts disabled. Declaration-based relations between plugin collections are unsupported; the format remains experimental.

<a id="миграции-хранилище-и-ui"></a>

## Migrations, storage, and UI

See [plugin lifecycle](./LIFECYCLE.md). Packages/plugin-comments demonstrates all three.

<a id="пакет-и-подключение"></a>

## Package and installation

Name, version, and dependencies remain in package.json. Asmblyr.manifest.version is the manifest format version, not Kit's version.

Export built modules through exports["."].default, types through exports["."].types, metadata through ./package.json, and generated dist/routes.json through ./routes. Namespaced packages also export dist/collections.json through ./collections. See packages/plugin-comments/package.json.

Install dependencies at the project root and explicitly enable them:

```json
{
  "asmblyr": {
    "plugins": ["@asmblyr-collaborative/plugin-comments"]
  }
}
```

Core validates enabled package names, manifest versions, and handlers before imports. Enabled-plugin failures stop startup. Discovery scans enabled packages only; installing a dependency alone does not enable it.

<a id="разработка-и-сборка"></a>

## Development and build

Pnpm dev uses enabled local workspace sources. Adding/changing/removing TypeScript files restarts Core and rebuilds route discovery; it is a process restart, not hot handler replacement.

Run asmblyr-plugin build in the package directory, as the Comments build script does. TypeScript uses rootDir:"." and outDir:"dist", including plugin.ts and server/\*_/_.ts. DOM/DOM.Iterable provide Web API types. Kit/examples use skipLibCheck because the pinned H3 RC declarations conflict with TypeScript 5.9 and refer to optional dependencies; project code stays strictly checked. Revisit this when upgrading H3.

The builder checks route names, default exports, and types, then generates JavaScript, declarations, and dist/routes.json in its own dist. Production/npm packages load the index and JavaScript without source scanning. Deleted routes disappear from the next build.

Workspace builds link Kit and bundled plugins. Pnpm build:plugins builds them; pnpm dev performs initial generation. Pnpm build builds packages before Core/UI. Publishing remains separate.

```sh
pnpm build:plugins
pnpm --filter @asmblyr-collaborative/kit --filter @asmblyr-collaborative/plugin-comments typecheck
```

<a id="локализация-расширения"></a>

## Plugin localization

Optional flat locales/ru.json and locales/en.json sit beside package.json. Publish locales alongside dist. Core reads them in source/built modes and includes them in protected GET /translations. Catalogs contain public labels only, never settings, keys, or user data.

UI uses defineUiPlugin({ translations: { ru, en }, ... }). Enable resolveJsonModule for JSON imports. Pages, record panels, and field interfaces support titleKey with title fallback.

```tsx
import { usePluginTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

function Panel() {
  const { t, locale } = usePluginTranslations("comments");
  return <p>{t("panel.title", "Discussion")}</p>;
}
```

The host supplies isolated i18next context using the profile locale, plugin.&lt;manifest.namespace&gt;, and Russian fallback. React escapes text. Never import the server entry in UI.

Collection.&lt;local-name&gt;.label and field.&lt;local-name&gt;.&lt;field&gt;.label|description|placeholder supply owned-table UI/API labels. Settings use settings.title, settings.description, and settings.&lt;field&gt;.label|description. Technical names, record values, and HTTP contracts are not translated.

<a id="личные-внешние-подключения"></a>

## Personal external connections

Model annotation connection:"google" makes a handler visible only with the current human's active connection. Declare connections.google and obtain explicit project approval.

`useActionContext`(event).connections?.google exposes owner-bound list, readText, sheet, cells, and proposeWrite. Kit exports PersonalConnections, GoogleWriteInput, GoogleFileList, GoogleText, GoogleSheet, and GoogleCells. There are no raw tokens, arbitrary URLs, or confirmation methods. `proposeWrite` saves a proposal; humans confirm actual writes in Core UI. HTTP/MCP share handlers. See packages/plugin-google-workspace and [Google Workspace](../../docs/features/google-workspace.md).

<a id="контракты-потребителеи-sdk"></a>

## SDK consumer contracts

Built defineModelContext handlers include generated input/output JSON schemas. GET /schema exports accessible handlers using AccessGate and original HTTP routes. Generated SDK methods use client.plugins.namespace[methodId](input) with inferred output. IDs join route segments with hyphens; no extra registry is needed.

The bounded JSON contract grants no data access and implies no personal OAuth connection. Execution rechecks the original gate/current Core permissions. Legacy defineAction handlers without generated outputSchema are omitted.

See [package checks and release preparation](../../docs/reference/packages.md).
