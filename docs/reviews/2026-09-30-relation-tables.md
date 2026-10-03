# Review: relation tables and junction parameters

## Delivered

- O2M/M2M table/list settings in existing field presentation JSONB, including
  ordered columns, label field, default sort, page size and create/select buttons.
- SQL projection of selected readable fields, stable pagination and sort;
  missing/inaccessible configured fields reconcile at read time.
- Reuse of `item-columns`, `ItemTableValue`, relation label batching and existing
  item forms. Relation panel state, table rows and linked creation have separate modules.
- Scoped junction read/update/create and atomic target+link creation, with normal
  write validation, grants, references and audit events.
- Junction FKs are omitted from the attribute editor and rejected by the scoped API.
- Native dialog close/cancel events cannot close an ancestor dialog.

## Verification

- Full Core suite: **79/79 passed**, including the new relation-tables integration suite.
- Core + UI typecheck and lint passed.
- Existing UI relation-label batching tests: **3/3 passed**.
- Browser on localhost, using three disposable fixture collections:
  - four selected columns rendered with labels, booleans and numbers;
  - second page showed remaining records;
  - editing a junction priority persisted `42` and reopening confirmed it;
  - two-step creation supplied a required role and created a linked record;
  - unlink + search/select + attribute form linked the same record again;
  - saving reordered/removed columns changed the actual relation table;
  - after the nested-dialog correction, the parent remained open;
  - no browser warnings/errors were captured.
- Screenshot: relation table (локальный артефакт, не публикуется).
- Fixture helper: `apps/core/test/support/relation-ui-fixture.ts setup|cleanup`.
- Disposable fixture collections/events were removed after verification; the
  original Ads workspace selection was restored.

## Self-review

Reviewed final changed modules and their call sites. This checkout is untracked,
so Git has no committed baseline for a useful incremental diff.

Checked malformed settings, target schema validation, field projection, unauthorized
sort, junction read/write grants, link ownership, FK reassignment, required values,
transaction rollback and audit attribution. Existing relation tests also pass.

Fixed an unstable items-array dependency in the relation label hook call to avoid
repeated network requests when relation-valued columns are displayed. Table rows
are keyboard accessible and do not nest URL links inside buttons. Popover/select/
dropdown portals stay inside the native dialog. The alias settings tabs wrap on
narrow screens. FieldEditorForm remains below 350 lines and owns the existing
field submission workflow; new relation configuration is a separate component.

No migrations, destructive rollback, or changes to existing user records are needed.
Relation presentation updates are metadata-only. Existing GET fields and batch
mutation semantics remain, while the default relation page size is now taken
from metadata (10 initially).

## Boundaries

- Label is one chosen physical field; composite templates remain a separate task.
- Junction attributes are edited in a drawer; they are not selectable target-table columns yet.
- Relations with editable junction attributes are attached individually; ordinary
  attribute-free relations retain multi-select.
- UI flags control button visibility, not API authorization. Row permission
  predicates, manual row ordering and a public extension SDK remain deferred.
- This verification does not establish performance at hundreds of thousands of rows.
