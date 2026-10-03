# Virtual workspaces (idea)

Status: shared workspaces implemented 2026-09-30.
See [the implemented contract](../design/five-features.md) and
[verification](../reviews/2026-09-30-five-features.md).

Ads, Cat, neural search, and other product areas may share some collections,
while each team needs a focused view of the collections relevant to its work.
A workspace would be a named selection of collections with quick switching in
the admin UI. One collection could appear in multiple workspaces without
copying its table or data.

Workspace selection would organize navigation. It would not restrict Core API
access or replace permissions; authorization must be enforced separately.
Deleting a workspace must not delete its collections or items.

The first stage uses shared workspaces managed by a superuser, stable collection
UUIDs for membership, and a personal saved selection. **Все коллекции** returns
the full accessible catalog. The sidebar and collection editor use the selected
workspace; authorized direct URLs remain usable. Personal workspaces and specific
workspace management permissions are possible later stages.
