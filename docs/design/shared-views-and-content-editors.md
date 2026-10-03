# Workspace header, content editors and shared views

Implemented 2026-09-30. This extends [the initial views/workspaces stage](five-features.md).

## Sidebar header

The single workspace header follows shadcn's TeamSwitcher: `SidebarMenuButton`
with `size="lg"`, icon tile, active workspace, product subtitle and dropdown.
Desktop opens to the right; mobile opens below. The icon remains usable in the
collapsed sidebar. Create/edit actions remain human superuser-only.

Selection persists through `PUT /users/me/workspace`. Switching refreshes server
data and effective views. If the current collection is outside the selected
workspace, navigation returns to the collection catalog. This is UI organization;
workspace membership grants no API permissions.

## Content editors and API validation

These are text-field presentation interfaces, not new physical SQL types:

| Interface | Storage | Editing / display |
| --- | --- | --- |
| markdown | text | Markdown textarea with preview; compact formatted table excerpt; rendered read-only content |
| richtext | text containing sanitized HTML | Basic Tiptap toolbar; sanitized editor input/output and read-only display; decoded plain table excerpt |
| url | text | Absolute HTTP(S) URL input and clickable safe link |

The HTML allowlist is p/br/strong/em/s/code/pre/blockquote/h2/h3/ul/ol/li/a/hr;
only anchor href/title attributes survive. Dangerous schemes, scripts, handlers,
embedded media and arbitrary styling are removed. Input HTML is capped at 100000
JS string units before sanitization. Markdown raw HTML remains stored as text,
but rendering skips it. URL values reject credentials, whitespace and schemes
other than HTTP(S). SQL writes are outside these API validations.

`presentation.constraints`:

| Field types | Keys | Allowed bounds |
| --- | --- | --- |
| text, email | minLength, maxLength | Integers 0–100000; minimum <= maximum |
| integer | min, max | Int32 bounds; minimum <= maximum |

For richtext, length counts decoded plain-text Unicode code points after trim;
for other text it counts the stored string's code points. Markdown syntax counts
toward its string length. An HTML field marked `required` must have nonempty
plain text, so `<p></p>` and whitespace entities do not satisfy it. Required and
database nullable remain separate contracts. Optional null values still follow
their field's nullable setting and bypass content length bounds.

Create, update and bulk writes share the same validators. Configured defaults
are checked when field rules or presentation change, and omitted primitive
defaults are normalized/validated during API create. Existing rows are not
rewritten when a presentation or constraint changes.

The current toolbar offers bold, italic, lists, undo/redo. Uploaded embedded
media, tables and custom HTML plugins are outside this stage. Decimal bounds,
regex and arbitrary validation expressions are also outside this stage.

## Named views: ownership and defaults

`asmblyr_table_views` stores the existing full definition:
`{columns:{order,hidden},sort:{field,direction},pageSize,filter,q}`.

| Scope | Owner | Visibility | Management |
| --- | --- | --- | --- |
| personal | user_id | Own user | Owner |
| collection | No private owner | Humans with collection read | Human superuser |
| workspace | workspace_id | Humans reading the collection while that workspace is selected | Human superuser |

Workspace-scoped saves require collection membership. Scope and workspace are
immutable on update; create a copy to move a view. Shared rows have nullable
`user_id`, plus `created_by` for attribution. Deleting their creator preserves
them; deleting their workspace/collection cascades its views.

Names are unique within scope+collection, up to 60 characters; at most 30 views
per scope+collection. One default is allowed per scope+collection, enforced by
partial indexes and serialized transactional writes. Changing a default clears
the previous one in the same transaction. Failed writes roll back that change.

| Method | Route | Result |
| --- | --- | --- |
| GET | /table-views/:collection | Visible views, including scope/workspaceId/isDefault/editable/available |
| GET | /table-views/:collection/default | Effective usable default or null |
| POST | /table-views/:collection | Create; omitted scope means personal, omitted isDefault means false |
| PUT | /table-views/:collection/:id | Replace name/definition; omitted scope/default preserve existing values |
| DELETE | /table-views/:collection/:id | Remove an editable view |

Effective default priority: **personal > selected workspace > collection**.
Unavailable definitions are skipped. Definitions are rechecked against current
read grants: deleted/forbidden columns disappear, invalid sorting falls back to
the primary key, inaccessible filters yield `definition:null,available:false`.
Shared view creation never grants field or row access.

At a bare collection entry, default search/filter apply. Nonempty search/filter
are written to the canonical URL along with sort/direction/limit so header search,
pagination and reload agree. Any explicit table query parameter bypasses implicit
default search/filter; `?q=` can explicitly open without those conditions.
Personal column preferences and saved sort/page size take priority over fallback
settings. `GET /users/me/table-preferences/:collection` returns `hasSaved` and
resolves missing settings without creating a preference row merely by reading it.

Saved filters use string operands, as expected by the filter API and UI builder.
SQL validation converts them to typed scalars. Older saved boolean/integer
operands are normalized on read, then validated with current field/relation grants.
Malformed shapes and unknown keys remain rejected; storage is not rewritten.

## Migration and remaining limits

Migration `20260930060000_shared_table_views.cjs` is additive. Existing private
views become personal, keep their owners and start with `is_default=false`.
Rollback refuses shared/default rows instead of discarding them. No destructive
rollback was performed.

Shared management delegation, role scopes, private workspaces, extra table
layouts and live cross-browser synchronization are future work. Default resolution
currently reads/reconciles the small visible view set; it is not a cached query
plan for large multi-tenant installations.

See [self-review](../reviews/2026-09-30-shared-views-and-content-editors.md) and
[Directus comparison and live inventory](../research/2026-09-30-directus-audit.md).
