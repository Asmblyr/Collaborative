# Field presentation review — 2026-09-29

## Scope and data safety

- Field editor: separate presentation tab; compatible editor selection; labels,
  help, placeholders, width, order and grouping. Record forms consume metadata.
- Additive migration 20260930020000 applied, batch 26. Existing field metadata,
  rows, validation and search preserved. No type/name changes. Rollback refuses
  to discard populated presentation metadata.
- Physical field deletion removes metadata; alias presentation belongs to alias
  rows and follows their existing cascade cleanup. Test checks drop/recreate.
- Superuser writes only. Catalog still filters metadata by existing field grants.
- Presentation validation rejects unknown keys, incompatible editor types and
  malformed settings. Plain text rendered through React, no HTML injection.
- Width uses container queries, so half-width fields stack in narrow dialogs.
- Partial field-creation retry patches the created field and resubmits search;
  name/back navigation disabled after creation to avoid a second field.
- Settings component and default-value conversion extracted. Existing editor is
  approximately 305 lines, reviewed: it coordinates Basic/Presentation/Search,
  while the new presentation UI and parser live in focused modules.

## Verification

- 16 focused Core/storage tests passed, including preservation of defaults,
  required/nullability/search, strict presentation validation, aliases, field
  grant filtering, reserved names and file lifecycle/access/token refresh.
- 8 regression tests passed for collections, lifecycle, relation options,
  search and permissions.
- 2 live BFF tests passed, including real YC storage and auth refresh on download.
- Workspace typecheck and lint passed.
- Chrome: grouped record form, adjacent half-width fields, multiline value,
  helper text, native dialog, shadcn editor dropdown and presentation save/reopen.
- Private raster preview decoded successfully; file history displayed create event.
- Browser upload chooser automation blocked by disabled extension file-URL access;
  the actual upload endpoint was exercised end-to-end against real storage.
- Synthetic browser fixtures removed after verification. No user content removed.

## Limits

Read-only and editable fields still render in separate sections. Inverse relations
remain in the Relations tab. Translations, custom editor plugins, table cell display
options and file/image relation fields are later stages; this change does not claim
Directus interface parity. Files currently require superuser.
