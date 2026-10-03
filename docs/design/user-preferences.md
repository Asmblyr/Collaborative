# Personal settings and sessions

Implemented 2026-09-29.

## Sessions

- `GET /users/me/sessions` lists the authenticated human's active sessions only.
- `DELETE /users/me/sessions/:id` revokes an owned session; foreign IDs return 404.
- `DELETE /users/me/sessions/others` keeps the current session.
- Profile > Security shows approximate browser/OS label, creation time, last token
  refresh and a current-session badge. Existing sessions have an unknown label.
- Revoke and refresh use the session row lock. Revocation invalidates both access
  and refresh immediately for subsequent requests. Revocations are audited.
- The BFF forwards browser user-agent at login. Core stores only a coarse derived
  label, not the full UA or forwarded IP. This label is informational, not trusted
  identity. Refresh time is not advertised as precise last activity.

## Appearance

`GET/PATCH /users/me/preferences` stores `{theme: "light"|"dark"|"system"}` per user.
No saved choice returns null; the UI starts with system theme. Both header switch
and profile appearance controls persist the choice. Failed saves are visible.
next-themes still caches rendering locally; Core is the cross-browser source.

## Table layout

`GET/PATCH /users/me/table-preferences/:collection` is human-only and requires read
access to the collection. Storage uses `(user_id, collection_id)` with foreign keys,
so deleting/recreating a collection cannot inherit the old collection's settings.

Properties:

- `columns: {order: string[], hidden: string[]}` — automatically saved on move/toggle.
- `pageSize: 10|25|50|100` and `sort: {field, direction: "asc"|"desc"}` — explicitly
  saved with the table's Save default view button.
- `collectionId` is read-only response metadata.

PATCH merges only provided properties. For the same property, last completed save
wins across clients. Rapid column changes in one browser are queued; failed saves
retain an in-memory draft with a retry control. There is no background live sync
between browsers: reopen/refresh the page to load another browser's changes.

Read-time reconciliation removes unavailable/deleted fields, appends new fields,
falls back to primary-key sort and ensures at least one column remains visible.
Writes reject inaccessible field names. Preferences never grant data access.

URL sort/page-size values override saved defaults. Search, current page, selection
and currently applied filters are transient until explicitly saved in a named view.
Named filter presets continue to use the existing saved-filter feature.
Personal complete table views were added on 2026-09-30: `/table-views/:collection`
stores filter/search, columns, sort and page size together, up to 30 per user and
collection. They can be created, replaced, renamed and deleted from **Вид**.
Applying one resets the page and selection. Unavailable filter fields make a view
unavailable; deleted/forbidden columns are removed and sorting falls back to the
primary key. Shared views are a later stage. See [the contract](five-features.md).
Old unscoped localStorage columns require explicit import into the current user's
profile. They are never silently assigned to a user.

The selected shared workspace is also saved per user through
`PUT /users/me/workspace`. Workspace membership uses stable collection IDs and
never grants data access.

Migration rollback refuses to discard populated preferences or recorded session
metadata. Interactive provider linking needs a separate OAuth application, client
configuration and callback URL; no auto-linking by email is introduced.
