<a id="коллекции-записи-и-связи"></a>

# Collections, records, and relationships

<a id="структура"></a>

## Structure

The home page / lists accessible collections in the selected workspace and opens records at /items/&lt;collection&gt;. Superusers manage structure, fields, and relationships separately at /admin/collections. Team/system settings remain at /admin/settings. Core API /collections and /items routes are unchanged by this separation.

A collection describes a user table or explicitly imported materialized view in public. Core reserves asmblyr* tables; plugins reserve plugin*&lt;namespace&gt;\_&lt;name&gt;. Their structure cannot be arbitrarily changed through the API.

Collection creation sets its technical name, singleton mode, primary key (serial, bigserial, UUID, or manually assigned string), and system timestamps. Display label, record-label template, navigation visibility, MCP description, and MCP enablement are separate settings. Hiding a collection does not revoke API access.

Field editors distinguish ordinary types and relationships, with settings grouped by purpose. Ordinary field names/types cannot change after creation. Nullable controls database NULL; required controls nonempty API values. These are different constraints.

Default system status uses published/draft/archived, with new records published. The default view hides drafts/archives as presentation behavior, not authorization. Status values are configurable.

<a id="работа-с-данными"></a>

## Working with data

<a id="дополнительные-поля-системных-коллекции"></a>

### Custom fields on system collections

The Show system collections section at /admin/collections starts collapsed. It contains users, files, policies, workspaces, and service accounts, excluding sessions, tokens, secrets, and internal tables. Locked built-in fields cannot have names, types, constraints, or presentation changed here. System collections cannot be renamed or deleted.

Superusers may add physical custom columns: ordinary types, dates, JSON, tags, choices, files, and many-to-one relations to ordinary user collections. Standard side panels edit their settings. Computed/conditional rules and search configuration are not yet supported. All custom columns remain nullable and optional so registration and built-in operations need no new values.

A default can be set; adding a column applies its default to existing rows, while later default changes affect only new records.

Additional data opens an existing-record selector and custom-field form. Superusers also edit users' extra fields in /admin/settings/users, with a separate save button. Native sections retain creation/deletion of system records. Deleting a custom field requires typing its name and removes its values; dependent SQL views block deletion, without CASCADE.

For example, create departments, then add a many-to-one department_id field to system Users targeting departments. User extra data gains a searchable record selector. Core creates a foreign key and index. Deleting a department clears the reference with ON DELETE SET NULL and preserves the user. Dropping departments is blocked while the relation exists.

The target and key type cannot change after creation. System/plugin tables, singletons, and materialized views cannot be targets. Reverse O2M/M2M fields and relation defaults are unsupported.

Existing POST configuration accepts:

```json
{
  "field": {
    "name": "department_id",
    "type": "relation",
    "targetCollection": "departments"
  },
  "presentation": { "label": "Department" }
}
```

Core API: GET /system-collections, POST|PUT /system-collections/:name/fields/:field/configuration, DELETE /system-collections/:name/fields/:field, GET /system-collections/:name/records, and GET|PATCH /system-collections/:name/records/:id.

Names users, files, policies, workspaces, and service_accounts belong to a separate system catalog. PATCH accepts `{ "values": { "custom_field": "value" } }` and changes registered custom columns only. Built-in values and secrets are not returned; selectors expose ID and label (email for users).

All these routes, including value editing, require an active human superuser. System tables do not become ordinary /items collections and are excluded from SDK generation. Ordinary users cannot self-edit these fields. The separate profile-extension collection with ordinary policies remains available.

Column ownership is recorded atomically with DDL in asmblyr_system_fields. Existing columns are never adopted as custom extensions. Future Core migrations must detect naming conflicts and resolve them explicitly while preserving data. Registry rollback is blocked while fields exist. Images/galleries use the normal library, and attached files cannot be deleted. Tests: node scripts/test.mjs core-system-collections.

<a id="связь-обычнои-коллекции-с-пользователем"></a>

### Linking an ordinary collection to a user

In an ordinary collection's relationship editor, choose Many to one → Users · system. For example, manager_id links a department to its manager. Forms, filters, and table cells show user name/email; records and SDK retain the UUID. System tables stay out of the ordinary catalog.

Superusers create the relation through POST /collections/:name/relations:

```json
{
  "kind": "m2o",
  "name": "manager_id",
  "targetCollection": "@users",
  "nullable": true,
  "onDelete": "setNull"
}
```

@users is a special target, distinct from a user-created users collection. Core creates a UUID column, index, and FK to the system user. Restrict and setNull are supported; cascading record deletion, reverse fields, defaults, computations, and dependent filters are not. Filtering by manager UUID works; searching the linked profile or paths such as manager_id.email is not exposed.

Searching, resolving labels, and assigning a user require a human session with Users read access or a superuser, plus write access to the source collection. Service keys cannot access the directory. Clearing an optional relation requires update on the field. Only active users can be assigned. Existing references may stay unchanged after the user is disabled or the editor loses directory access.

GET /users/references returns only id/label and accepts q, page, limit (1–100), and ids (up to 100 comma-separated UUIDs). Search shows active users; known-ID lookup can label stored references to disabled users. Without read permission, labels are unavailable and the UI shows UUIDs.

/items/asmblyr_users remains closed. Migration creates no custom fields automatically; rollback is blocked while user relations exist.

### Materialized views

Superusers import existing PostgreSQL materialized views using the Connect view icon at /admin/collections. The side panel selects a public source, then label, row key, folder, record label, and field labels. The view joins the selected workspace. Saving registers only Collaborative metadata; cancellation creates nothing. Ordinary field settings and the card builder then control formats, translations, order, and placement.

Without a custom layout, short fields use two columns (one in a narrow panel), while titles and long content span the width. Numbers use separators without losing decimal/bigint precision; booleans use compact badges. Explicit labels, translations, formats, hidden settings, and layout take precedence. Automatic labels only replace underscores with spaces; translations and currency are never guessed. This read-time presentation changes neither SQL nor metadata and works for previously imported views.

Import requires a populated view with supported scalar fields and one stable key: UUID, positive integer/bigint, or a nonempty string up to 255 characters. A valid, full, single-column UNIQUE index must cover that key. Composite, partial, and expression indexes do not qualify. Source/field names must follow normal API naming rules. Incompatible or already imported objects show a reason and cannot be selected; reserved Core/plugin objects are excluded.

Views are read-only. Tables, cards, filters, sorting, search, SDK, and MCP use ordinary read APIs. Other users need separate grants on output fields/rows; source-collection permissions do not transfer. SDK schema marks sourceKind as materialized-view and disables create/update/delete; generated types prohibit writes.

The record list shows a Read only badge, while permitted presentation settings, search, and filters remain available.

The server rejects row creation/update/deletion, bulk/nested commit, physical fields, indexes, CRUD status fields, and FK relationships, even for superusers. Editable presentation metadata never changes SQL. Disconnect view removes the catalog connection and its grants/metadata while preserving the PostgreSQL object and data.

External migrations/processes own SQL definition, creation, and REFRESH MATERIALIZED VIEW. Reloading the UI only reads data. External refresh must preserve a unique, nonempty, stable key. Column changes or loss of the unique index return 409 MATERIALIZED_VIEW_CHANGED and require reconnecting the source. Unpopulated views return 503 MATERIALIZED_VIEW_NOT_POPULATED. Last external refresh time is not displayed. Composite keys, ordinary views, and logical relationships to views are unsupported.

<a id="типы-и-простые-редакторы"></a>

### Types and simple editors

Date stores a calendar day without time or time zone. API, SDK, and Kit use YYYY-MM-DD; the calendar editor never shifts days for device time zone. Range: 0001-01-01 through 9999-12-31. Invalid dates and timestamps are rejected. Datetime keeps its time-zone-aware instant contract.

Ordinary bigint is a signed 64-bit integer, distinct from a bigserial primary key. API input/output is a canonical decimal string, such as "9007199254740993", ranging from "-9223372036854775808" to "9223372036854775807". JavaScript numbers, fractions, exponents, leading zeros, and -0 are rejected. PostgreSQL performs numeric filtering/sorting.

Character varying/varchar in an already managed collection maps to text without changing SQL type or length limits. This does not automatically import arbitrary tables.

Select uses string options for text and numeric options for integer, including zero/negative numbers. Example: `{ interface: "select", options: [{ value: 0, label: "Standard" }] }`. Core validates types, allowed values, and defaults. Removed choices remain visible in old records; new records and explicit field edits accept only current choices. JSON multiselect stores string choices.

Tags creates a JSON column with interface:tags, also selectable for existing JSON fields. Enter or blur adds a tag; the cross removes it. Cards show all tags; tables show three plus +N with a tooltip.

API/editor accept up to 100 strings, each up to 120 characters after trimming. Empty tags, trimmed duplicates, and control characters are rejected; case/order are preserved. Required fields need at least one tag; optional allows []; nullable also allows null. Defaults use the same validation.

Changing the interface does not rewrite old data. Incompatible values remain visible as raw JSON and are validated when explicitly edited. /schema exports strings without a closed enum; SDK generation uses string[] with null for nullable fields. Refresh after interface changes with asm schema pull and asm generate.

Use the same option list for radio-style scenarios. Ordinary JSON uses a text editor with client/server validation. Text with interface:url accepts absolute HTTP(S) URLs without credentials; a compact button opens valid links in a new tab, including read-only views.

<a id="редактирование-и-таблица"></a>

### Editor and table

Click a row to open a side editor at /items/&lt;collection&gt;/&lt;id&gt;. Without update access it is read-only. Creation uses the same dialog. Selecting rows reveals a floating action bar.

Tables support pagination, sorting, column order/visibility/resize, search, filters, and views. Search defaults to relevance: exact match, whole-word prefix, whole word within a label, then substring. Exact primary keys rank highest. Primary search fields win equal matches over secondary fields. Automatic priority uses record-label/template fields, falling back to the first text field; field/relation editors can override it. Matching is literal and case-insensitive, without typo correction or morphology.

Resize by dragging a header's right edge; double-click resets. Keyboard separators support Left/Right (16 px), Home/End (80/1200 px), Delete/Backspace (reset), and Escape (cancel drag). Widths save to personal preferences after pointer release, survive reload, and join named-view definitions. Hiding/reordering preserves widths; removing fields or read access removes their settings. Record-edit permission is unnecessary.

GET/PATCH /users/me/table-preferences/:collection and table-view columns accept optional widths, for example:

```json
{ "order": ["id", "title"], "hidden": [], "widths": { "title": 400 } }
```

Widths are integer CSS pixels from 80–1200 for accessible fields. Empty maps reset all widths; missing field keys use defaults. Old definitions without widths remain valid.

Search participation and indexing are separate. Configured relationship search traverses one level, uses related labels, and does not duplicate source rows. Hidden/sensitive fields contribute neither matches nor ranking. Relations with conditional row grants are excluded for now.

PostgreSQL ranks before pagination; ties use the selected column and primary key. Header clicks select field ordering; the relevance switch restores ranking. Personal views retain the mode. Global search ranks within each collection, not across collections. An index does not guarantee a suitable plan at every scale: inspect EXPLAIN on your workload.

HTTP/SDK order accepts relevance or field. Search with q and no explicit sort/direction uses relevance; explicit sorting preserves field order. Order=relevance with sort uses that field for ties. Without search text, effective order is always field and appears in page.order.

Related-record tables without explicit columns show key, label field, and up to two accessible M2O context fields, such as a category's marketplace. A backlink to the current card's collection is omitted. Hidden/sensitive fields are excluded; user-selected columns take precedence. Empty labels stay empty rather than borrowing another field's title. M2O labels use normal related-record permissions.

Filters combine AND/OR, including permitted related fields. Closed fields cannot become filtering/sorting channels. HTTP pages are limited to 100; total is a string.

<a id="связи-и-сохранение"></a>

## Relationships and saving

M:1, inverse 1:M, and M:N with a junction collection are supported. Forms select existing records or create new ones. Every affected collection/field is checked separately. Moving between parents requires the corresponding relation update.

POST /items/:collection/commit saves the root and related changes in one transaction. Failure also rolls back history and transactional hooks. Drafts permit 100 changes and depth 5. Sequential ordinary HTTP requests do not share a transaction.

<a id="правила-поля-и-зависимые-формы"></a>

## Field rules and dependent forms

The side editor's Rules tab controls hidden, read-only, conditional-required, and M2O-copy behavior. Rules.hidden changes forms only; policies still control API access. Rules.readonly rejects explicit writes through the normal writer, including superusers. Create defaults apply without manually writing the read-only field.

Example presentation for note:

```json
{
  "rules": {
    "requiredWhen": {
      "mode": "all",
      "rules": [{ "field": "enabled", "operator": "eq", "value": true }]
    }
  }
}
```

Conditions use other scalar fields with eq, ne, empty, notEmpty and all/any, up to 12 rules. False/zero are not empty. Core checks the final record, including defaults and previous PATCH values. Required values cannot be NULL or empty/whitespace strings. Form validation reveals required hidden fields; server errors preserve the draft.

`rules.computed: { relation: "project", field: "client" }` copies project.client on save. Source/target scalar types must match, including target collection for foreign keys. Only one direct M2O is supported; chains, cycles, and arbitrary expressions are rejected. Explicit computed-field writes are forbidden. Users need source-read and result-write access. Missing relation sources yield NULL with normal nullable/required checks.

This computes on save, not dynamically: editing a source does not update every dependent record. Sensitive sources require sensitive results.

A relationFilter can restrict M2O candidates, such as cities by the form's region:

```json
{
  "relationFilter": {
    "logic": "and",
    "children": [
      {
        "field": "region",
        "op": "eq",
        "value": { "kind": "field", "field": "region" }
      },
      {
        "field": "active",
        "op": "eq",
        "value": { "kind": "literal", "value": true }
      }
    ]
  }
}
```

Candidates use ordinary filters and row/field permissions. Selection stays disabled until dependencies are filled. Changing a parent clears dependent form references, including the next level. Core validates on create and when the relation or its dependency changes. Invalid links are rejected; the server never silently selects/clears them. An old archived choice may remain when editing an unrelated field.

Literals are scalars or scalar arrays; dependencies are scalar form fields. AND/OR supports 30 nodes and depth 3. Related filter paths permit one hop; row conditions along that hop still fail safely. Conditions with inaccessible dependencies are omitted from the catalog.

These checks apply to HTTP, SDK, Kit, bulk, and nested commit. One invalid row rolls back the transaction. Direct SQL bypasses the writer.

Record-label templates support two M2O hops, such as <code v-pre>{{project.client.name}} · {{title}}</code>. The catalog suggests valid fields. Each hop checks read access, including row rules; unavailable values fall back to the normal label/key. Resolution uses batched queries. To-many paths and template expressions are unsupported.

Inverse 1:M/M:N panels can be placed in a form section/tab for existing records without duplication below the form. On new records, placed panels show a hint until first save.

<a id="защита-от-перезаписи"></a>

## Overwrite protection

The side editor remembers original values and sends expectedValues for changed fields only. Core compares them under a row lock in the same transaction, including nested records, foreign keys, and junction attributes. It compares actual values rather than timestamps, detecting changes from ordinary PATCH, plugins, or direct SQL at the next protected save.

Edits to different fields can save independently. If another save already wrote the identical desired value, the repeat succeeds. A mismatch returns 409 ITEM_CHANGED and rolls back the entire commit. The UI retains the draft, fetches accessible current values, and offers Your value / Current value. Users continue editing and save explicitly; the next write checks its baseline again. Read failures or access changes keep the draft open.

SDK and Kit opt in through items.commit expectedValues for each existing modified record. Omission remains compatible. Ordinary update, bulk changes, and SQL do not require baselines. This is changed-field comparison, not a version counter or whole-card lock. Returning a field to its original value is not a conflict. JSON, rich text, and arrays compare as whole values. Relationships use explicit attach/detach rather than whole-list snapshots. Drafts are in-memory and do not survive reload.

Conflict errors do not expose current values. Every compared field requires read and write access, including conditional grants.

<a id="кто-сеичас-здесь"></a>

## Who is here

Existing record cards show compact avatars for participants viewing that record. Hover/focus shows names; multiple windows of one person share one avatar. Three avatars plus an overflow count are visible. Unsaved new records have no presence.

The legacy presence UI polls every five seconds. Profile name/avatar are used, with Participant as fallback. Core stores 30-second PostgreSQL leases and removes them on leaving; expiry covers offline closes. Revoked/expired sessions and disabled users are excluded on the next list read. Presence failures hide avatars without blocking editing. See [real-time collaboration](./realtime.md) for SSE presence and field-lock behavior.

Every update checks current row-read access. Other record participants see names, avatars, and window counts, not email, search/filter URLs, sessions, or record values. Presence does not imply active editing. Plugin collections use ordinary record presence.

<a id="история-и-удаление"></a>

## History and deletion

Item events record actor, time, and changed values.

Text/email with presentation.sensitive:true is masked in read-only forms/tables, edited as a password, and excluded from record labels. History stores [REDACTED] in before/after for create/update/delete, bulk, and nested commits. Enabling this setting irreversibly scrubs older events for the field in the same transaction; disabling it does not restore them. Sensitive defaults are forbidden.

This is neither encryption nor a write-only API: authorized reads still return live values, controlled by field permissions. Operators must handle database copies, direct SQL, and external logs.

History reads project permitted fields and omit events touching only closed fields. Schema history and safe field rollback with data restoration remain unimplemented.

Direct SQL and database cascades bypass the ordinary writer and do not guarantee equivalent history/hooks. Deleting collections/fields requires a superuser and impact checks. Operators remain responsible for backups.

Sources: apps/core/src/collections and apps/core/src/items; contracts: packages/contracts/src/items.d.ts; [SDK reference](../reference/sdk-guide.md).
