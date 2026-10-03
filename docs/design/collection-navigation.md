# Virtual collection hierarchy

Collections can live at the root, in a folder, or under another collection.
This only organizes navigation; it creates no data relations, permission
inheritance, workspace membership or URL changes.

## Contract

- `POST /collections` accepts `folderId` or `parentCollection` (technical name).
- `PATCH /collections/:name/navigation` accepts those same properties and an
  optional `before` sibling name. Null means the root / append to the group.
- Both parents cannot be set together. Self-parenting and ancestor cycles fail
  with HTTP 400; missing parents fail with 404. Changes require a superuser.
- The existing `/collections/:name/folder` endpoint remains compatible.
- `GET /collections` includes `parentCollection`. An inaccessible parent is
  omitted from that reference; accessible children remain available.
- Each collection has one navigation location. Folders remain at the root.
- Deleting a collection promotes its immediate children to its former position;
  deeper descendants remain attached. Deleting a folder moves its root children
  to the root, preserving their subtrees. Normal data dependency checks still apply.

## Storage and concurrency

Migration `20261001030000_collection_navigation.cjs` adds a nullable self-reference
on `asmblyr_collections.parent_collection`, defaulting existing collections to no
parent. A check constraint prevents two parents and immediate self-reference.
The existing transaction advisory lock serializes create, move and delete and
prevents concurrent moves from introducing cycles. Ordering is local to each
folder / parent collection. Rollback refuses to discard configured nesting.

## Interface

- The structure editor shows nested, collapsible rows and a location selector.
- Drop into the middle half of a row to nest; drop at its top/bottom edge to reorder.
- In the sidebar, a collection title opens its items; its separate arrow toggles
  children. The collapsed sidebar uses a shadcn dropdown with indented entries.
- Hidden or out-of-workspace parents do not hide visible children: those children
  appear at the root of the visible tree. Permission and MCP settings are independent.
