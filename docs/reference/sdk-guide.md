<!-- Generated from packages/sdk/README.md; edit the source. -->

# @asmblyr-collaborative/sdk

Typed Collaborative HTTP client for browsers and Node.js 22+. Every operation calls the main API. Runtime dependencies do not include H3, Knex, PostgreSQL, the TypeScript compiler, or a plugin loader. Use the separate @asmblyr-collaborative/kit to develop extensions.

<a id="профиль-пользователя"></a>

## User profile

A human access token can access its own profile. Profile updates cannot change status, permissions, passwords, or system timestamps. New profile fields are optional.

```ts
await client.users.updateMe({
  firstName: "Ivan",
  lastName: "Example",
  description: "About me",
});
await client.users.updatePreferences({ timezone: "Asia/Yekaterinburg" });
const { data: me } = await client.users.me();
```

Configure extra fields in an ordinary UUID collection and select it in user settings. asm connect / asm generate includes its fields in the project schema:

```ts
const { data: profile } = await client.users.extension("user_profiles");
await client.users.saveExtension("user_profiles", { bio: "Hello" });
```

`saveExtension` creates/updates the current user's ID. First save needs create/read; later changes need update/read. Normal row/field, relationship, and file rules apply. Supply generated-schema fields only, and use the selected extension's collection name. Hidden fields may be absent and data may be null. After initial creation, ordinary items/fluent APIs edit its records and relationships. Arbitrary profile creation through items.create is forbidden.

<a id="подключение-клиента"></a>

## Connect a client

Personal notifications use client.notifications.list(), .read(id), and .readAll(result.readBefore). They require a human session; service keys cannot access an inbox. Core retains the latest 200 events per user.

Install prereleases with the beta tag:

```sh
npm install @asmblyr-collaborative/sdk@beta
npm install --save-dev @asmblyr-collaborative/cli@beta
```

```ts
import { createClient } from "@asmblyr-collaborative/sdk";

// Browser sessions remain in HttpOnly cookies.
const client = createClient({ baseUrl: "/api" });

const records = await client.items.list("articles", {
  fields: ["id", "title"],
  limit: 20,
  page: 1,
  sort: "title",
  direction: "asc",
});
const record = await client.items.get("articles", 4);
const profile = await client.users.me();
```

`baseUrl` is the API root: `http://localhost:3001` for direct Core or `http://localhost:3000/api` on the admin domain. The SDK does not add /api automatically. A relative /api works in browsers.

Direct Core requests can supply an access token:

```ts
const client = createClient({
  baseUrl: "https://asmblyr.example.com/api",
  accessToken: () => currentAccessToken,
  timeoutMs: 10_000,
});
```

`accessToken` may be a string or async function called per request. Human and service tokens are supported; Core checks permissions. `users.me` requires a human. SDK does not store browser tokens, sign in, or refresh tokens itself. Admin sessions use HttpOnly cookies validated by Core.

<a id="реализованные-методы"></a>

## Available methods

| Method                                         | HTTP                           | Response                 |
| ---------------------------------------------- | ------------------------------ | ------------------------ |
| items.list(collection, options?, request?)     | GET /items/:collection         | { data, labels, page }   |
| items.get(collection, id, options?, request?)  | GET /items/:collection/:id     | { data, label }          |
| users.me(request?)                             | GET /users/me                  | { data: CurrentUser }    |
| items.create(collection, values, request?)     | POST /items/:collection        | { data: row or null }    |
| items.update(collection, id, values, request?) | PATCH /items/:collection/:id   | { data: row or null }    |
| items.delete(collection, id, request?)         | DELETE /items/:collection/:id  | void (204)               |
| items.commit(collection, draft, request?)      | POST /items/:collection/commit | { data: { id: string } } |

This is the central record API, not complete coverage of every system resource or bulk operation. There is no direct database access or actor/superuser switching.

List supports fields, page, limit, sort, direction, order, q, and filter. SDK serializes query/filter values; Core validates access and limits. Filters are logic:and/or groups with children; condition values are strings or string arrays. Relationship search/filtering follows the main API. Pages are capped at 100, and page.total remains a string.

Core additionally applies permission conditions; SDK cannot provide trusted context. Conditionally permitted fields may be missing from some rows. See [access rules](../features/access.md).

Omitting fields returns permitted fields. Fields:[] sends fields= and returns only the primary key, always added by Core. Explicitly requesting a closed field yields 403. Collection/field names are technical identifiers. Label/labels may use other permitted fields.

Pass large integer IDs as strings. Unsafe JavaScript numbers are rejected. String IDs are encoded as one URL segment; "." and ".." are unsupported because HTTP clients normalize them. HTTP dates are ISO strings and bigserial values are strings; SDK does not convert them to Date/number.

<a id="запись-и-сохранение-связеи"></a>

## Writes and relationships

```ts
const created = await client.items.create("articles", { title: "Article" });
await client.items.update("articles", 4, { title: "New title" });
await client.items.delete("articles", 4);

// One transaction for the root record and related changes.
await client.items.commit("articles", {
  id: "4",
  values: { title: "Article with a category" },
  references: { category_id: { values: { title: "New category" } } },
});
```

Core enforces create/update/delete, field constraints, related-record access, validation, and history. Create/update return readable fields only; data:null means a successful write without read access. Delete authorizes the record, not a field list.

Each call is a separate transaction. Sequential create/update calls do not become atomic. Commit saves a related draft and rolls back all changes/history on failure. Existing records in a draft require read access; ordinary update can work with write-only grants.

ItemCommitDraft contains references, relations (attach/detach/create/links), and records for existing changes. Limits: 100 changes and depth 5. Commit returns only the root ID, including creation without read access. UI-only preview/label/key values are not sent.

For overwrite protection, supply original values of modified fields:

```ts
const previous = await client.items.get("articles", "4");
await client.items.commit("articles", {
  id: "4",
  values: { title: "My edit" },
  expectedValues: { title: previous.data.title },
});
```

A mismatch returns ApiError with status:409 and code:ITEM_CHANGED and rolls back the commit. Keep the draft, fetch current data, and let the user choose. Do not automatically retry with a new baseline: that would overwrite another person's change.

Different-field edits do not conflict; an already-applied identical value succeeds. Nested records need their own expectedValues, including modified foreign keys. Every compared field needs read/update. Omitting expectedValues or using items.update retains unconditional behavior. JSON/arrays compare as whole values.

<a id="участники-страницы"></a>

## Page participants

```ts
const clientId = crypto.randomUUID(); // one open window
const scope = { kind: "record", collection: "articles", id: "4" } as const;
const { data } = await client.presence.touch({ clientId, scope });
// data.participants: ID, name, avatar, window count, self; data.total
await client.presence.leave(clientId);
```

Touch extends a 30-second lease and returns up to 50 users, current user first, merging windows of one human. Repeat while the window is open: this legacy HTTP API has no SDK-managed timer. Realtime below maintains presence automatically.

Leave removes only the current human session's window and is idempotent. Sessions support up to 32 active windows; excess returns 429. Scopes are accessible page, collection, or record; each touch rechecks read access. Responses omit custom fields, email, tokens, and session IDs. Services do not participate. Network loss may leave presence until expiry; presence does not lock writes or identify active fields.

## Collaborative Live

```ts
const live = client.realtime.connect();
const unsubscribe = live.subscribe(
  { kind: "record", collection: "articles", id: "4" },
  (event) => {
    if (event.type === "record.updated") {
      // Reread with items.get; events contain no field values.
      void client.items.get(event.payload.collection, event.payload.recordId);
    }
  },
);
const offState = live.onState((state) => console.log(state));
const lock = {
  collection: "articles",
  recordId: "4",
  field: "title",
  clientId: crypto.randomUUID(),
};
await live.locks.acquire(lock);
// While editing, refresh the lock before its 30-second lease expires.
await live.locks.release(lock);
unsubscribe();
offState();
live.close();
```

Subscribe supports page, collection, and record scopes. States: connecting, connected, reconnecting, offline. SDK resubscribes with backoff/jitter and emits collection.changed after reconnect so clients reread. Duplicate event IDs within a stream are ignored.

Admin browsers use HttpOnly cookies; external clients need human Bearer tokens. Service keys are unsupported. Locks are temporary UX signals; items.commit with expectedValues remains the write safeguard.

<a id="типизация-коллекции"></a>

## Collection typing

```ts
interface Schema {
  articles: {
    id: number;
    title: string;
    created_at: string | null;
  };
}

const client = createClient<Schema>({ baseUrl: "/api" });
const result = await client.items.list("articles", {
  fields: ["title"],
  sort: "id",
});
// result.data[0].title: string | undefined
```

TypeScript checks collection names, selection, and sorting; projections reflect fields. Schema properties remain optional because access can hide them. A primary key is not inferred from the name id; collections may use another key. Include it explicitly in fields to have it in the projected type.

Without Schema, the client uses dynamic JSON dictionaries. Model date as string (YYYY-MM-DD), ordinary bigint as an exact integer string, and integer choices as number or numeric unions. SDK never converts these to Date/Number. Core validates related filter paths at request time.

Write a schema manually or obtain it with asm connect; see [generated types and fluent queries](#generated-types-fluent-queries-and-plugin-methods). SDK does not validate response structure at runtime; Core enforces current permissions and constraints.

Manual schemas type create/update and root commit values as Partial&lt;Schema[collection]&gt;, checking names, types, and nullability. Core metadata still checks required create fields, defaults, immutable keys, and system fields. Generated schemas separately model read/create/update with required fields and available actions. Nested drafts still use the JSON contract without inferred related-collection types.

CurrentUser and record/page/filter/error contracts are re-exported from @asmblyr-collaborative/contracts, also used by Core. Database rows, password hashes, and internal models are not public SDK types.

<a id="ошибки-и-отмена"></a>

## Errors and cancellation

```ts
import { ApiError } from "@asmblyr-collaborative/sdk";

try {
  await client.items.get("articles", 4, undefined, {
    signal: controller.signal,
  });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(
      error.status,
      error.code,
      error.requestId,
      error.message,
      error.details,
    );
  }
}
```

HTTP failures become ApiError. Network/cancellation errors retain their fetch errors; locally invalid paths/IDs throw TypeError. Default timeout is ten seconds including body reads; timeoutMs:0 disables it. Request.signal cancels one call; request.timeoutMs overrides its timeout. The admin uses zero for commits so SDK does not limit save duration.

Requests are never retried automatically, HTTP redirects are rejected, and fetch uses cache:no-store. Cancellation/connection failure does not prove rollback of a submitted write: inspect the result before retrying.

Custom fetch, headers, and credentials are supported. Credentials defaults to same-origin; SDK does not configure server CORS. On servers, create clients per user/request to avoid sharing tokens across users.

<a id="сборка-и-проверки"></a>

## Build and checks

Run pnpm packages:check to verify tarball installation outside the workspace. After publishing, pnpm packages:check --registry verifies the same version from npm without local aliases.

```sh
pnpm --filter @asmblyr-collaborative/sdk build
pnpm --filter @asmblyr-collaborative/sdk typecheck
pnpm --filter @asmblyr-collaborative/sdk test
node scripts/test.mjs core-sdk
```

Integration tests start Core on a temporary port with a disposable database and compare SDK/Kit behavior, including permissions.

<a id="переводы"></a>

## Translations

```ts
const { data } = await client.translations.get("en");
console.log(data.core["appearance.ocean"]);
console.log(data.schema.articles?.fields.title?.label);
```

GET /translations?locale=ru|en (or /api/translations on the admin domain) requires an active human or service credential. Version 1 returns locale, fallbackLocale:ru, flat core strings, active plugin catalogs by namespace, and accessible schema labels.

Schema visibility follows the collection catalog, including create/update metadata, without granting record reads. Responses contain no records, defaults, or plugin settings. Omitted locale defaults to Russian; unsupported locales return 400.

<a id="генерируемые-типы-fluent-запросы-и-методы-плагинов"></a>

## Generated types, fluent queries and plugin methods

[CLI](cli-guide.md) connects through the admin browser approval screen, or
uses an API token from the environment/stdin. It saves no credentials:

```sh
pnpm exec asm connect --url https://asmblyr.example.test
pnpm exec asm schema pull
pnpm exec asm generate
pnpm exec asm schema check --offline
```

GET /schema, also client.schema.pull(), exports accessible collection wire types,
effective field permissions, supported filter kinds and generated plugin model
contracts. Defaults, records, secret values and policy conditions are excluded.
Browser approval grants only temporary schema access; runtime requests require a
separate API credential or session. The generated file exports ordinary TS types
and a small browser-safe descriptor. No custom compiler or consumer bundler plugin
is needed. The Node-only generator is isolated in @asmblyr-collaborative/sdk/schema.

JSON fields configured with `interface: "tags"` export as freeform `string[]`
(or `string[] | null` when nullable), without a closed enum. After changing a field
to tags, run `asm schema pull` and `asm generate` to update its generated types.

```ts
import { createClient } from "@asmblyr-collaborative/sdk";
import { schema } from "./asmblyr.schema.js";

const client = createClient({ baseUrl: "/api", schema });
const articles = await client.Articles.select((a) => [a.id, a.title])
  .where((a) => a.status.eq("published").and(a.price.gte("1000.00")))
  .orderBy((a) => a.created_at.desc())
  .limit(20)
  .exec();
// Equivalent collection entry point, with name completion:
const result = await client.collection("articles").limit(10).result();
await client.items.create("articles", { title: "Hello" });
// When the calculator model is installed and accessible:
const calculation = await client.plugins.calculator.calculate(input);
```

The example assumes those fields exist. Aliases derive from technical collection
names, independent of translated labels. Query builders are immutable. where calls
combine with AND; predicates support and/or groups. exec returns rows; result
returns the existing ItemListResult envelope. orderBy supports one field, matching
the Core API. `search("feed")` selects relevance unless a field order was already
explicitly chosen. `orderBy` selects field order; `orderByRelevance()` restores
relevance and keeps the chosen field as a tie-breaker. The low-level list API
accepts `{ q: "feed", order: "relevance" }`, and `page.order` reports the effective
mode. Relevance is calculated by Core before pagination using readable searchable
fields and their configured priority, with exact, word-prefix, whole-word and
substring matches. Without `q`, Core uses field order.

limit accepts 1–100; page and search are also supported. Operators
are suggested according to exported field capabilities. JSON and multiselect
fields do not expose scalar predicates. Older snapshots without filterKind offer
only conservative equality/list operators. Decimal and bigint remain API strings.

Read/Create/Update maps separate required create fields, optional updates,
managed fields and choice unions. Selected responses contain only selected keys;
values remain optional because server permissions can hide fields. Current Core
permissions and row conditions are always checked at runtime. Existing manually
written row schemas and the items client remain supported.

Plugin methods use generated Kit model input/output schemas and the existing
HTTP routes; no additional handler registration is needed. AccessGate filters
contracts in the exported schema, and execution checks current access again.
Legacy actions without output schemas are omitted. The bounded JSON model subset
supports closed objects, arrays, literals, unions and primitives; arbitrary refs,
open objects and defaults are rejected. Personal integration authorization is
checked when calling the method, even if its static contract was exported.

An imported materialized view has sourceKind: "materialized-view" and read-only
actions. Its generated Create/Update are never and delete is unavailable. Fluent
queries, items.list and items.get still work. Core rejects all writes, including
bulk/nested commits by a superuser. SQL creation and refresh remain external.

asm schema check verifies hashes and detects remote contract changes. --offline
compares generated source with the saved snapshot; asm generate recreates source
from it. Names, choices and plugin annotations can disclose project structure;
commit generated files only when appropriate. Npm publication remains a separate
release action. See [package preparation](packages.md).
