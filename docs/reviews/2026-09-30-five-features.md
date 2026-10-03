# Five feature stages — implementation and review

Date: 2026-09-30. Scope: `apps/core`, `apps/ui` and project documentation.

## Delivered

1. File/image and ordered gallery fields in records: select/upload, private
   metadata/preview/download, detach and reference-aware deletion.
2. Decimal, JSON, single/multiple choices, defaults and shared record editors.
3. Atomic bulk editing through the floating selection bar, explicit field
   selection and per-record audit with a shared request ID.
4. Personal named full table views with filter/search, columns, sort and page size.
5. Shared virtual workspaces with superuser management, personal switching,
   accessible collection navigation and atomic membership on collection creation.

Contracts and first-stage limits: [design](../design/five-features.md).

## Self-review

- Compared source changes against the pre-task Core/UI snapshots. Routes stay
  thin; value validation, file references, bulk mutation, views, workspace service
  and their editors are separate modules. No new source file exceeds 350 lines.
  The 319-line field editor remains one existing field-settings form; the
  267-line items workspace coordinates its extracted dialogs/table. Both were
  reviewed at the 250-line threshold for responsibility boundaries.
- Technical names/types, protected Core structures and `required`/`nullable`
  semantics are preserved. Decimal values are never converted to JS Number by
  the editor or response path. JSON arrays are serialized explicitly for pg.
- Normal field/relation grants apply to bulk writes. A missing row aborts all
  writes, unchanged rows produce no audit. Shared item update logic avoids a
  separate bulk implementation drifting from single-record validation.
- Attachment writes lock ready file rows; deletion locks the file before
  checking actual managed collection values. Indexed UUID fields and GIN gallery
  fields support those checks. Cache references alone cannot authorize a read.
  Direct SQL can bypass Core validation; gallery references added entirely
  through SQL need API synchronization before ordinary users can read them.
- Personal views cannot be accessed through another user's ID. Revoked/deleted
  columns are reconciled; forbidden filter definitions are withheld. Workspace
  membership never grants permissions, and deletion preserves tables/items.
- Corrected client/server workspace reconciliation so identical recreated RSC
  props cannot overwrite a newer client fetch. New workspaces appear immediately;
  selected workspace persists after refresh. Uploads block dialog closure and
  tab switching, and partial upload successes remain available to the record.
- Existing database migrations are additive. Down migrations refuse configured
  data; no destructive rollback was run. Existing collections were preserved.

## Verification

- `pnpm test:integration`: **69/69 passed**, including new feature coverage.
  Evidence: [Core output](../../artifacts/reviews/2026-09-30/core-integration.log).
- Re-ran extended-fields, bulk-items, table-views-workspaces after the latest
  changes: **10/10 passed**. This includes creating a collection inside a
  workspace and proving that a missing workspace leaves neither table nor metadata.
- `pnpm typecheck`: Core/UI passed.
- `pnpm lint`: Core/UI passed.
- `pnpm db:status`: 29 completed migrations, no pending migration.
- Chrome: created and reopened a record with a precise decimal, choices and an
  existing file; added/reopened a gallery; bulk-updated three records; saved and
  applied a complete view, restoring a hidden column; created/edited/switched
  workspaces, checked the collapsed switcher and persisted selection; created a
  choice field from **Добавить поле** and saved its value. No console warnings/errors.
- Editor screenshot (локальный артефакт, не публикуется).
  Saved gallery and choices in the table (локальный артефакт, не публикуется).

## Cleanup and verification limits

Browser checks used a disposable collection, workspaces and views. They are
removed after verification, selection is reset to **Все коллекции**, and the two
users left by an earlier failed test cleanup were removed by exact ID/email after
confirming no data/file/policy links. The existing file and user collections remain.

API upload/download/delete checks used isolated in-memory object storage. Browser
checks selected an existing library file; no new cloud object or infrastructure
change was made. No new production build was run against the active dev output.
This verifies the implemented first stage, not performance at production scale.
Attachment deletion currently checks the managed catalog; many collections can
increase its cost. Granular upload/library permissions, shared views, workspace
management delegation, image processing and permission filters remain future work.
