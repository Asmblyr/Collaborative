# Forms, repeaters and value displays

## Product contract

- Collection form layout is versioned JSON metadata, separate from SQL schema.
  Root tabs contain fields and sections. Sections may nest (three levels), can
  collapse and carry a description. Tabs never nest inside tabs.
- A field appears at most once. New/unplaced fields remain available in an
  automatic section. Deleted fields disappear without breaking the layout.
- The same renderer serves creation, editing and read-only views. Field grants
  determine the available fields; layout never grants access. To-many relations
  keep their dedicated record tab for now (they require a persisted parent).
- Conditions use all/any scalar comparisons, without arbitrary code or network
  lookups. They affect visibility only, never API validation. Missing condition
  dependencies make the condition inactive. Hidden values and tab drafts persist.
- Required unfilled creation fields cannot be hidden. Validation reveals the
  relevant tab and collapsed groups. Responsive widths depend on available form
  space. A visual organizer with reorder/move controls and a working preview
  avoids authoring JSON.
- Repeater is an interface for JSON arrays of objects. Typed child fields reuse
  existing scalar editors; rows can be added, collapsed, moved and removed.
  Child schemas are bounded and nonrecursive in this version. Unknown keys in
  existing objects survive edits. Incompatible legacy JSON is shown explicitly
  and never silently converted. Server validation applies to item writes and
  defaults; changing the schema does not rewrite existing rows.
- Value display is independent of input interface: status badges, exact decimal
  number formatting and dates with explicit timezone. Composite record labels
  accept only simple field placeholders. If any referenced field is unreadable
  or missing, the whole template falls back to an allowed label/primary key.
- Adaptive Cards remain a possible format for notifications, approval cards and
  automation results. They are not a dependency of the record editor.

## Storage and compatibility

Add nullable `form_layout` and `display_template` to `asmblyr_collections`.
Extend existing field presentation JSON with `repeater` and `display` settings.
No user tables or existing values change. Old field group/order/width settings
continue to work when no collection layout has been configured. Resetting a
layout restores that behavior. Migration rollback removes only new presentation
metadata, never record data; take a metadata backup before rollback.

## Where to configure

- **Коллекции → expand a collection → Форма** opens the floating native dialog.
  Add tabs/sections, select a node to edit its properties, move it using arrows
  or **Расположение**, and check **Предпросмотр** before saving. Preview validates
  local inputs without creating a record or uploading files. Reordering uses
  buttons and a parent selector; drag and drop is not implemented.
- **Field → Отображение → Редактор → Повторяемая форма** configures a JSON
  repeater: child keys, types, required values, widths, options and row limits.
- **Field → Отображение** configures badges, number formatting or date display
  independently of the input editor. Dates have an explicit IANA timezone.
- **Collection → Отображение → Составная подпись** configures a plain-text
  label, e.g. `{{title}} · {{code}}`. It is used in record titles, relation
  pickers/tables and global search. Placeholder values use raw scalar values;
  field display formatting and option labels are not applied to templates.

## API and bounds

All metadata writes below require a superuser. Core-owned collections remain
protected. The catalog returns only the form fields and label templates allowed
by the caller's field grants; conditions referencing unreadable fields are removed.

| Endpoint | Body |
| --- | --- |
| `PUT /collections/:name/form` | `{version: 1, tabs: [...]}`; JSON `null` restores automatic layout |
| `PUT /collections/:name/display` | `{displayField: string \| null, displayTemplate?: string \| null}`; omitting the template clears it |
| `PUT /collections/:name/fields/:field/presentation` | Existing presentation object, optionally including `repeater` or `display` |

Form structure supports 1–12 root tabs, 3 nested section levels and 300 total
nodes including tabs. Field nodes have a `full` or `half` width. Section nodes
have a label, description, children and collapse options. Sections and fields
can have `when: {mode: "all" | "any", rules: [...]}` with up to 12 comparisons:
`eq`, `ne`, `empty`, `notEmpty`. A field cannot hide itself and a section cannot
depend on its own descendants. This release has no arbitrary expressions,
relation traversal, computed fields or value reset on hide.

Repeaters support 1–24 scalar child fields and at most 200 rows. Child types are
text, email, integer, decimal, boolean and datetime. Text children can use a
textarea, Markdown, URL or select editor. Required and min/max row rules are
validated by Core on create/update/bulk writes and defaults. Existing incompatible
values stay readable and do not block an unrelated-field update; editing the
repeater validates the whole submitted value against its current definition.

Displays support status badges (six colors), number precision 0–20 with grouping,
prefix/suffix, and date/time formats with timezone. Number formatting uses decimal
strings, preserving PostgreSQL precision. Templates support up to 8 distinct
scalar fields in a 500-character definition; rendered labels are capped at 160.

No extension runtime is introduced. To-many relations retain the separate
record **Связи** tab; recursive JSON editors and localized display settings are
possible follow-up work, not capabilities of this version.
