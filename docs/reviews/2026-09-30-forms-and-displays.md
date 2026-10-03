# Forms, repeaters and displays: review

Date: 2026-09-30. Scope: the three approved feature groups; extensions deferred.
Contracts and usage: [design](../design/forms-and-displays.md).

## Delivered

- Collection form organizer in a wide native floating dialog: tabs, nested
  collapsible sections, field widths, ordering, moving, conditions and preview.
  Create/edit/read-only use the same layout. Drafts survive tab and visibility
  changes; validation reveals the relevant tab and section.
- Typed JSON repeaters: child editors, required values, row limits, titles,
  add/remove/reorder/collapse. Core validates all item write/default paths while
  preserving unknown JSON keys and untouched legacy values.
- Separate value displays: status colors, exact decimal formats, explicit date
  timezones. Composite labels work across record titles, global search, relation
  previews/tables, pickers and filters with grant-aware fallback.

## Self-review

Existing-file changes were compared against the pre-task source archive;
new modules, migration, tests and package script were inspected separately.
The final scoped comparison is [forms.diff](../../artifacts/reviews/2026-09-30/forms.diff).
It includes source, migrations and tests; README, design/review docs and the
Core test script are documented separately. Git files are mostly untracked,
so ordinary git diff is insufficient here.

- Runtime modules remain focused; no changed source file exceeds 350 lines.
  Removed the obsolete layout renderer and a settings-component import cycle.
- Conditions only change UI visibility. Required API validation and field grants
  remain authoritative. Unreadable condition literals/templates are removed from
  catalog responses. No expressions, HTML or arbitrary code execute in labels.
- Deleted fields are removed from saved forms/templates before recreation can
  accidentally inherit old placement. Unplaced/new fields stay reachable.
- Validation preserves existing untouched legacy JSON. Unknown object keys survive
  browser edits/reordering and server normalization. Converting raw legacy JSON
  into a valid list mounts row state with fresh stable identities.
- Added an explicit Date-to-ISO fallback for relation display overrides and
  regression coverage. Exact decimal formatting does not use floating-point
  arithmetic. Invalid timezones are rejected by Core.
- Migration `20260930040000_forms_and_labels.cjs` adds only nullable metadata
  columns. Applied locally as batch 31. Readiness requires both new columns.
  Existing collection data is unchanged. Down removes the new presentation
  metadata; no destructive rollback was run.

## Verification

| Check                                                   | Result                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Full Core suite before final Date/readiness adjustments | 82 passed, 0 failed                                                                                               |
| Focused Core forms/displays suite after final Date fix  | 4 passed, 0 failed; includes grant safety, writes/defaults, field deletion, valid 3-level/invalid 4-level nesting |
| Focused UI forms/displays, labels and relation batching | 10 passed, 0 failed                                                                                               |
| Final Core and UI typecheck                             | Passed                                                                                                            |
| Final Core and UI lint                                  | Passed                                                                                                            |
| Live Core `/ready` after final readiness adjustment     | `status: ready`                                                                                                   |
| Browser organizer                                       | Add section, move field, save, reopen and preview checked                                                         |
| Browser validation/drafts                               | Required repeater on another tab revealed; collapsed group opened; title draft survived tab switching             |
| Browser conditional field                               | Switching status hid/restored the same note draft                                                                 |
| Browser repeater                                        | Reordered rows, saved and reloaded; SQL assertion confirmed order, hidden draft and unknown `legacy` property     |
| Browser displays                                        | Green status, `1 234 567,90 ₽`, timezone result `17:30`, item count and composite title verified                  |
| Final browser reload                                    | No new warnings or errors; workspace restored to Ads                                                              |

Turbopack briefly reported missing imports while the shared defaults were moved
between files during hot reload. The completed imports pass typecheck/lint;
the final reloaded page has no new console errors.

Disposable `test_forms_ui` collection, records and event history were removed.
The repeatable local fixture helper is `apps/core/test/support/forms-ui-fixture.ts`.
No remote Directus or cloud changes were made in this task. Production build,
mobile browser and a separate read-only browser session were not tested;
Core permission behavior and readonly layout filtering are covered by tests.

## Current bounds

Root tabs only; up to three section levels. Reordering uses arrows and the parent
selector, without drag and drop. To-many relations remain on the record relations
tab. Repeaters are nonrecursive scalar forms, not nested collections. Preview
performs client validation, not a simulated database write. Concurrent layout
edits currently use last-write-wins. Limits and endpoints are in the design doc.

Adaptive Cards remain a possible future format for notifications, approval cards
and automation results, with their actions routed through normal authorized API
operations. They are not a dependency of these forms.

## Visual evidence

Form organizer (локальный артефакт, не публикуется)

Repeater editor (локальный артефакт, не публикуется)
