# Permissions foundation

Status: policy and permission management and Core resource authorization are
implemented for collections and items. The admin UI manages users, policies,
collection actions, allowed fields, and assignments. Record filters and UI
sections are pending.

## Model

- A permission exists independently of policies and grants one action (`create`, `read`,
  `update`, or `delete`) on one collection. It stores allowed field names or
  `*` for all fields. Delete uses `*` because it removes the whole item.
- A policy is a named set of permissions. The `asmblyr_policy_permissions`
  junction table connects them many-to-many: one permission can be reused by
  several policies. Removing a permission from a policy leaves the catalog
  permission intact. Editing or deleting a catalog permission affects every
  policy that uses it. Deleting a policy leaves its permissions intact.
- Users can have multiple policies. Matching permissions will be additive;
  field lists combine by union. An absent permission means no access.
- Collection references use the stable collection ID. Dropping a collection
  deletes its permissions. Dropping a field removes its name from grants, and
  removes any grant left with no fields.
- `superuser` bypasses collection grants. Only superusers can change collection
  structure or request deletion impact previews.

There is deliberately no record filter column or filter parser. Those semantics
need a separate product decision. Likewise, UI sections and virtual workspaces
have not been turned into data permissions.

## Current Core API

All policy and permission management endpoints require an active superuser Bearer token.
`GET /permissions/me` requires any active user Bearer token and returns
`{ data: { superuser, permissions } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/policies` | List or create policies |
| GET, PATCH, DELETE | `/policies/:id` | Inspect, update, or delete a policy |
| PUT, DELETE | `/policies/:id/users/:userId` | Assign or remove a user's policy |
| PUT, DELETE | `/policies/:id/permissions/:permissionId` | Add or remove an existing permission from a policy |
| GET, POST | `/permissions` | List or create permissions; GET accepts `policyId` filter |
| GET, PATCH, DELETE | `/permissions/:id` | Inspect, change fields, or delete a permission |
| GET | `/permissions/me` | Read current user's combined permissions |
| GET | `/users/:id/access` | Superuser view of a user's assigned policies and combined collection permissions |

Policy create and rename also accept the legacy body `{ "name": "Editors" }`.
The admin editor sends the full configuration in one transaction:
`{ "name": "Editors", "permissions": [{ "collection": "articles", "action": "read", "fields": ["title"] }], "userIds": [] }`.
Each collection and action can occur once in this body. Omitted grants and user
assignments are removed from that policy. If a permission is shared with another
policy, changing its fields through this endpoint preserves the other policy's
access by attaching a separate permission. A failed validation rolls back the
entire change.

Create a permission
with `{ "collection": "articles", "action": "read", "fields": ["title"] }`.
The response includes `policyIds`; newly created permissions have an empty
array until attached. Different permissions may cover the same collection and
action; their fields combine when assigned policies grant both. `PATCH /permissions/:id` accepts only `fields`, for
example `{ "fields": ["title", "content"] }` or `{ "fields": ["*"] }`.

`GET /users/:id/access` returns `{ data: { user, policies, permissions } }`.
The `permissions` array contains the combined grants from assigned policies.
For a superuser it is empty because collection grants do not limit that account.
The user's status and `hasPassword` indicate whether the configured access can
currently be used. The admin user table opens this summary in a read-only side
dialog.

## Resource enforcement

`/collections`, `/items/:collection`, and `/item-events/:collection` require an
active user token. `/collections` lists collections with at least one grant and
only fields covered by create, read, or update grants. Its `access` member tells
the UI which actions are available. Structure changes require `superuser`.

Item reads select granted fields. The primary key is always returned as the
technical item identifier when collection read is granted. Writes reject fields
outside the matching create or update grant. Create and update responses contain
only readable fields, or `data: null` when the caller has no read grant. Delete
requires a delete grant. Audit events record the authenticated user; history
requires read access, removes ungranted field values, and omits events whose
changes are entirely hidden. Pagination cursors still advance through the raw
event stream, so a page can contain fewer visible events than its limit.

The Next.js admin uses server-only Bearer forwarding and HttpOnly session
cookies. Structural editing controls are shown only to superusers, while item
controls follow the collection's action grants. Future API protocols and
connectors must apply these same Core checks.
When Core is available and a non-superuser has no collection with create, read,
or update access, the admin layout shows a standalone access-needed page with
only a sign-out action. This is a UI condition until minimum platform rights
and the access-request workflow are defined.

The admin policy editor opens in a wide side dialog. It shows every collection
and the four supported actions in one matrix. Enabling an action in the draft
grants all fields, including fields added later; field settings allow a narrower
grant. The editor also drafts the policy name and user assignments. One explicit
save applies the complete configuration, while closing the dialog discards the
draft. The permission catalog remains available through the Core API but has no
separate admin screen.
