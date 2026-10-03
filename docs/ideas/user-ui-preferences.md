> Update 2026-09-29: personal theme, table columns and default sort/page size are implemented.
> Current contract: [user preferences](../design/user-preferences.md). The proposal below is historical.

# User UI preferences (idea)

Status: product idea; no storage model or API contract yet.

Keep the current table column order and visibility in browser `localStorage`.
The theme also remains a browser preference for now. Later, signed-in users
should be able to keep their personal UI choices across browsers and devices.
Candidates include column order and visibility per collection, table page size
and sort, theme, and other display settings introduced by the admin UI. Named
item filters now have their own per-user Core table. Old browser-only filters
remain in `localStorage` until each one is imported.

These are presentation preferences, separate from collection data and access
rules. A saved preference must be reconciled with the fields the user can
currently read and with later collection structure changes. A stored layout
must never make an unavailable field visible.

Before implementation, decide which settings belong to the user versus a
shared workspace, how browser-only settings move to the account, and how to
resolve changes made on multiple devices. The current `localStorage` behavior
does not change until that contract is chosen.
