# Record editing, views and workspaces

Implemented 2026-09-30 in Core and UI.

## Fields and attachments

| Field | PostgreSQL | API/editor |
| --- | --- | --- |
| decimal | numeric(30,10) | Decimal string, 20 integer and 10 fractional digits; no exponent notation |
| json | jsonb | Structured JSON editor; depth 8, 5000 nodes, serialized length 64 Ki characters |
| single choice | text | `select` presentation, 1–100 value/label options |
| multiple choices | jsonb | `multiselect` presentation, unique array of option values |
| file | uuid + indexed RESTRICT FK | File/image picker, raster preview, download and detach |
| files | jsonb + GIN index | Ordered unique UUID array, up to 100 attachments |

Decimal values remain strings in responses, defaults and audit records. JSON
arrays/objects can be defaults. File defaults are rejected. `required` forbids
null API writes and empty required choice/gallery arrays, independently from
PostgreSQL `nullable`. Omitted create fields may use configured defaults.

File library writes and selecting new attachments remain human superuser-only.
Reading an attachment follows the collection field's read grant. Existing IDs
may be retained/reordered/removed by a caller with field update access. IDs alone
never grant read access; missing/inaccessible metadata resolves to no result.
See [file access and deletion](files.md) for storage consistency and limitations.

Upload is bounded at 25 MiB per file and 20 files per selection. Record dialogs
cannot close or switch tabs while uploading. Uploaded objects remain in the
library when a later record draft is cancelled. Image transformations,
resumable uploads and granular library permissions are future work.

## Bulk updates

`PATCH /items/:collection` accepts `{ids: string[], values: object}`. IDs must be
unique, 1–100; values must be nonempty and writable. Managed fields and primary
keys remain protected. Missing records or validation/constraint failures abort
the whole transaction. All selected rows are locked in database key order.

Response: `{data: {selected, changed}}`. Changed rows receive ordinary update
history with a shared request ID; no-op rows get no event or timestamp change.
The UI requires explicit field checkboxes so unselected fields stay unchanged.
Existing bulk deletion retains its earlier per-record behavior.

## Complete named views

Personal views use `asmblyr_table_views`, referencing user and stable collection
IDs. Up to 30 per user/collection; names are unique within that scope, max 60.

Definition: `{columns:{order,hidden}, sort:{field,direction}, pageSize, filter,q}`.
Page size is 10/25/50/100. Existing Core filter validation, including relation
grants, is reused. Saving/applying a view grants no access. Applying resets the
page and selected rows. The current layout still autosaves; default sort/page size
and existing filter-only presets remain available.

GET lists owned views. POST creates; PUT replaces name/definition; DELETE removes.
Routes: `/table-views/:collection` and `/table-views/:collection/:id`. Foreign view
IDs return 404. Read-time reconciliation drops forbidden/deleted columns,
appends new columns, preserves at least one visible column and falls back to
primary-key sorting. Invalid/inaccessible filter definitions return unavailable
views with `definition:null`, avoiding disclosure of hidden filter values.
Shared/default views were added in the [follow-up stage](shared-views-and-content-editors.md).
Automatic synchronization between browser sessions remains later work.

## Shared virtual workspaces

Workspaces group existing collection UUIDs; a collection may belong to multiple
workspaces without copying data. Names are unique, max 120; descriptions max 500;
up to 100 workspaces and 500 collections per workspace.

Human superusers manage them through `/workspaces`. Humans list/switch only
workspaces with collections they can use; inaccessible collection names are
omitted. Their selected workspace is stored separately per user. Empty/deleted/
unavailable selections fall back to **Все коллекции**.

The sidebar and collection editor follow the active workspace. The full
accessible catalog remains available for relation configuration. Direct URLs and
Core data grants are independent of workspace membership. Deletion removes only
the group and its links. Collection deletion removes its links and saved views.

Creating a collection with `workspaceId` checks that workspace and inserts its
membership within the same DDL transaction. A missing workspace leaves no table
or catalog row. The UI supplies the active workspace automatically.

No workspace-specific roles, private workspaces or record permission predicates
were introduced in this stage.
