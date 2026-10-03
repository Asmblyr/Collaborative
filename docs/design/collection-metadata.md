# Collection names and MCP exposure

Implemented 2026-10-01.

## Settings

- `name` remains the technical identifier used by PostgreSQL, routes, permissions,
  workspace membership and saved views. This feature does not rename it.
- `displayName`: optional human-readable title, up to 120 characters. Whitespace
  is trimmed; empty/null restores the technical name in the UI. Used in collection
  navigation, headers, the catalog, collection search and collection selectors.
- `mcp.enabled`: boolean, default `true` for existing and new collections,
  preserving the assistant's existing behavior.
- `mcp.description`: optional purpose/context text, up to 2000 characters.
  Empty/null clears it. Disabling MCP in the editor preserves the description.
- `displayField` and `displayTemplate` continue to describe individual record
  labels. They are distinct from the collection title.
- `hidden`: boolean, default `false`. The **Скрыть из навигации** switch in
  **Отображение** removes a collection from the Data sidebar (including folder
  dropdowns), ordinary users' collection list and global search results.
  Superusers still see it in the structure editor, marked **Скрыта**.
  Empty sidebar folders disappear automatically. Existing collections remain
  visible until explicitly hidden.

Hidden collections remain in the permission-filtered `/collections` catalog so
relation pickers, forms, workspace configuration and permission editors keep
working. Their records remain accessible through relations, direct URLs and the
normal API, subject to existing permissions. Searching *within* a hidden
collection, or through a relation to it, still works. Visibility is an interface
preference, not an access restriction; MCP is controlled independently.

Both creation and editing have an **Отображение** and an **MCP** tab. Creation
also has **Основное** for technical name, folder, key and timestamps. Editing
uses one atomic save across both tabs and guards unsaved changes on close.

## API and persistence

`POST /collections` accepts `displayName`, `hidden` and `mcp`. A superuser can update them
through `PATCH /collections/:name/settings`:

```json
{
  "displayName": "Площадки",
  "hidden": false,
  "mcp": { "enabled": true, "description": "Площадки и их параметры сбора данных." }
}
```

Omitted top-level keys remain unchanged. A supplied `mcp` object replaces its
settings and requires a boolean `enabled`. The endpoint also accepts
`displayField` plus optional `displayTemplate` for atomic editor saves. The
existing `/display` endpoint remains supported. Unknown keys, invalid types,
oversized values and reserved system collection names are rejected.

Migration `20261001010000_collection_metadata.cjs` adds `display_name`,
`mcp_enabled` and `mcp_description` to `public.asmblyr_collections`. User tables
and records are untouched. Automatic rollback is refused to avoid discarding
names, descriptions and configured restrictions.

Migration `20261001020000_collection_visibility.cjs` adds `hidden` to the same
metadata table. Rollback refuses to discard configured hidden collections;
user tables and data are untouched. Regression coverage is in
`collection-visibility.integration.test.ts` (creation, toggling, global search,
hidden M2M targets/junctions, direct reads, MCP independence and validation).

## Assistant boundary

MCP exposure applies to the [internal MCP](internal-mcp.md), used exclusively by
the assistant through an in-memory transport. There is no public MCP endpoint.
Collection metadata itself does not enable external access.

- On a disabled collection the model receives no collection identifier, table
  query, schema, description or data tools. General chat remains available.
- `describe_collection` includes the title and description for enabled
  collections. These are untrusted descriptive data, never system instructions.
- Every schema/proposal/data tool call rechecks current exposure, even for a
  superuser and even if the chat was opened before disabling the collection.
- One-hop relation discovery, filters and search exclude disabled target
  collections and disabled M2M junction collections. O2M is covered too.
- A foreign-key value physically stored on an enabled source remains source
  data subject to normal field permissions; it does not expand the target row.
- Normal collection/item APIs, UI visibility and grants are unaffected. Enabling
  MCP never adds read permissions. User and field permissions still apply.
- The setting restricts future tool reads. It cannot retract an earlier model
  response or user-supplied content already present in chat history.

Verification: `collection-metadata.integration.test.ts`, existing assistant
context/data tests, collection/form/search regressions, Core/UI typecheck and
Chrome create/edit flow with a disposable collection.
