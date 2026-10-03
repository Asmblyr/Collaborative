# Record drafts

The record editor has one draft and one save, including nested dialogs. Applying
a nested form, attaching/detaching a record or editing junction attributes does
not write to the database. The parent save sends `POST /items/:collection/commit`.
Standalone item and relationship mutation endpoints remain available to API clients.

## Request

```json
{
  "id": "4",
  "values": { "title": "Updated parent" },
  "references": {
    "category_id": { "values": { "title": "New category" } }
  },
  "relations": {
    "children": {
      "attach": [{ "id": "18" }],
      "detach": ["21"],
      "create": [{ "record": { "values": { "title": "New child" } } }]
    },
    "tags": {
      "attach": [{ "id": "7", "record": { "values": { "note": "Link attributes" } } }],
      "create": [{ "record": { "values": { "title": "New tag" } }, "link": { "values": { "note": "New link" } } }],
      "links": [{ "id": "12", "record": { "values": { "note": "Edited link" } } }]
    }
  },
  "records": [{ "collection": "categories", "record": { "id": "3", "values": { "title": "Edited related record" } } }]
}
```

- Omit `id` to create a record. Existing records require read access; creating
  a root record supports create-only access. The response is `{ data: { id } }`.
- `references` resolves M2O drafts before assigning foreign keys. Editing the
  currently referenced record alone does not require write access to the parent FK.
  Selecting a different record requires that access.
- `attach.id` identifies a target; `detach` and `links.id` identify link records
  (the child itself for O2M). Junction attribute drafts support nested references.
- `records` contains edits to existing related records opened from a list or
  backlink. Each entry independently requires the corresponding collection/field
  permissions. It is not an authorization shortcut or a relation reassignment API.
- All mutations and audit events run in one PostgreSQL transaction and share a
  request ID. Validation, permission or ownership errors roll back everything.
- O2M parents and both junction keys are supplied by Core. Attempts to set them
  in a create/link draft are rejected. A child owned by another parent returns
  `409 RELATION_PARENT_CONFLICT`; it must be unlinked there first.
- The envelope rejects unknown keys and mismatched link IDs. Maximum nesting is
  five levels below the root; at most 100 nested record nodes and attach/detach/link
  actions combined. Scalar fields use the existing typed item validators.

## Editor behavior

Pending relation operations display readable labels and Undo. Newly created
records and junction attributes can be reopened. Edits to existing related
records have a separate summary and Undo. Relation previews use the draft until
it is committed or discarded. Selecting a different M2O drops the old reference
draft so abandoned records are not accidentally created.

Close and Escape prompt before discarding fields or nested changes. Navigation
uses the browser Navigation API for cancellable transitions, including
same-document Back/Forward; ordinary links are also guarded. Continuing retains
the URL and form. Confirming a transition discards the open editor stack. Reload
and non-cancellable document exits use the native `beforeunload` prompt.
Older browsers without Navigation API retain link/close/reload protection, but
same-document Back/Forward protection requires Navigation API support.

Drafts are currently kept in memory, not saved across reloads or browser crashes.
File uploads retain their existing separate file-library lifecycle; discarding
a form does not delete an already uploaded object. Transactional commit does not
add optimistic concurrency/version checks against another editor's field changes.

## Verification

- Core: `record-draft.integration.test.ts` checks transactions, rollback/audit,
  nested grants, create-only root, readonly parent, O2M ownership, junction scope,
  HTTP save and canonical labels with private-field fallbacks.
- UI: `record-draft-model.test.ts` checks serialization and reverting drafts.
- Chrome: related creation in `shops/4`, reopening drafts, close confirmation,
  Back/Forward with continue/discard, nested edit/Undo, and successful combined
  save on disposable collections. DB checked before and after save; three writes
  shared one audit request. Imported records were not committed during UI checks.
