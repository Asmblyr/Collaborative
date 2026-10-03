# Workspace header, content editors and shared views: review

Date: 2026-09-30. Scope: the three authorized implementation stages and a
read-only Directus audit. Import/export and automations remain deferred.

## Delivered

- Canonical shadcn TeamSwitcher in the sidebar header, with expanded/collapsed
  behavior, mobile positioning and persisted workspace selection.
- Text presentation interfaces: Markdown with preview, basic Tiptap HTML,
  safe HTTP(S) links, text/email length and integer range constraints.
- Personal/collection/workspace named views with defaults, field-grant
  reconciliation and shared management restricted to human superusers.
- [Directus audit](../research/2026-09-30-directus-audit.md): comparison matrix,
  business-domain inventory, all 164 custom collections, 13 folders, 1372 fields,
  324 custom relation records, flows, registry and database-object statistics.

Contracts: [design](../design/shared-views-and-content-editors.md).

## Self-review

Reviewed the changed Core/UI source against the pre-task snapshots in
`%TEMP%/asmblyr-workspaces-editors-20260930`. The final source comparison is
retained in [source-review.diff](../../artifacts/reviews/2026-09-30/source-review.diff).
Migration, integration test, dependency manifests and documentation were read
separately. Repository files are currently mostly untracked, so git diff alone
would not describe this task's changes.

- All new source modules are focused and under 350 lines. The existing
  270-line items workspace still coordinates extracted table/dialog/actions
  components; its new additions are view context and permissions plumbing.
  Routes remain thin. The long audit is generated documentation, not a runtime
  module; its generator is a separate reproducible artifact.
- Existing names/types, required/nullable behavior and protected Core structures
  remain intact. HTML defaults and writes use the same normalization; length
  checks decode entities and count code points, avoiding false failures for
  ampersands and emoji. Empty rendered HTML cannot satisfy required.
- HTML display uses the same allowlist in Core and UI. Unsafe attributes/tags
  are stripped; URL protocol/credentials/whitespace are checked. Existing rows
  are not silently rewritten by presentation edits.
- Scope/owner consistency has a database CHECK. Partial indexes enforce names
  and one default per scope. Collection locks serialize shared saves; failed
  writes restore the former default. Workspace membership is checked/locked.
  Migration preserves old personal rows. Down refuses shared/default data;
  no destructive rollback was run. Readiness now checks the four added columns.
- Shared views cannot bypass collection/field grants. Forbidden filter values
  are withheld. Personal IDs owned by somebody else return 404; shared editing
  also requires a superuser. Deleting a creator preserves shared rows, while
  workspace/collection deletion follows its cascade lifecycle.
- Workspace selection refreshes server defaults. Bare-entry search/filter are
  canonicalized into the URL so header, pagination and reload agree. Explicit
  table parameters and saved personal preferences retain their priority.
- During the final browser check, found a real round-trip bug: parsed boolean
  and integer filter operands had been stored as typed scalars, while the filter
  API/builder expects strings. Extracted the wire serializer, return/store string
  operands, and normalize older saved values on read before grant validation.
  Unknown keys/malformed shapes remain rejected. Both presets and full views
  now use that contract; new raw API requests still require string operands.
- Removed an introduced UTF-8 BOM and disposable browser helper files. No
  remote Directus data or Kubernetes configuration was changed.

## Verification

| Check                                                          | Result                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full Core integration suite before the final filter correction | 71/71 passed; [log](../../artifacts/reviews/2026-09-30/content-shared-views-integration.log)                                                                       |
| Focused suite after filter correction                          | 10/10 passed: content-shared-views, filter-presets, item-filters, table-views-workspaces, field-defaults                                                           |
| Root typecheck after final source changes                      | Core/UI passed                                                                                                                                                     |
| Root lint after final source changes                           | Core/UI passed                                                                                                                                                     |
| Migration status                                               | 30 completed, no pending                                                                                                                                           |
| Running Core /ready                                            | status ready                                                                                                                                                       |
| Browser                                                        | Workspace menu, shared collection/workspace defaults, rich text save, Markdown preview, URL links and shared-view save checked                                     |
| Final default query check                                      | Bare entry redirected with q/filter/sort/limit; header contained needle, exactly one matching row, hidden ID, page size 10. Explicit ?q= showed all 3 fixture rows |
| Generated audit                                                | Generator asserted 164/13/1372/324/32/34 collection/folder/field/relation/flow/registry counts                                                                     |

Focused command (from `apps/core`):

```powershell
pnpm.cmd exec tsx --test --test-concurrency=1 test/content-shared-views.integration.test.ts test/filter-presets.integration.test.ts test/item-filters.integration.test.ts test/table-views-workspaces.integration.test.ts test/field-defaults.integration.test.ts
```

Regression coverage includes unsafe/empty HTML, Unicode entity length, invalid
URLs, defaults, bulk failure atomicity, shared visibility/writes, default
priority/uniqueness, inaccessible filters, personal preference priority, cascades
and boolean/integer filter reload with legacy stored operands.

Screenshots:

- Workspace header (локальный артефакт, не публикуется).
- Content editor (локальный артефакт, не публикуется).
- Default search/filter (локальный артефакт, не публикуется).
- Live Directus demo form (локальный артефакт, не публикуется).

## Cleanup and limits

Disposable local browser collections/workspaces/views/users were removed; the
real collections articles/example/test_col, existing workspace and user account
remain. The user tab is back at the collection catalog. No new cloud objects,
credentials, permission grants or infrastructure were provisioned in this task.

One earlier fixture cleanup assertion was inconclusive because the shell pipeline
corrupted Russian expected literals; exact-ID cleanup was completed. The final
default fixture used ASCII data, passed the visible browser check and exited
through its normal cleanup. API assertions and browser results are distinguished
from that helper encoding issue.

No production build, large-data load test, full permissions audit or extension
source audit was run. The final 10 focused tests cover the correction; the full
71-test result predates it. Rich text remains a basic toolbar; decimal bounds,
JSON repeaters, nested form tabs/conditions and custom display/extension contracts
remain future development. Details and priorities are in the audit.
