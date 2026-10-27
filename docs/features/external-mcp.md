# External MCP

Settings → Applications shows the installation's `/api/mcp` address. Add it as a
Streamable HTTP server in an MCP client with OAuth support. Sign in to your usual
Collaborative account, choose collections and optionally allow record creation
and updates. No administrator key or pasted user password is required.

For local Windows deployments, a browser may resolve `.localhost` while a native
MCP client uses the system DNS resolver. Map the public hostname to loopback in
`C:\Windows\System32\drivers\etc\hosts` when needed, for example
`127.0.0.1 collaborative.asmblyr.localhost`. Editing this file requires Windows
administrator access. Use normal DNS for a remotely deployed installation.

The server supports MCP **2025-11-25** with the installed SDK and stateless JSON
responses. Earlier SDK-negotiated revisions are accepted. SSE subscriptions,
transport sessions and protocol 2026-07-28 are not implemented. Authorization
metadata is served at `/.well-known/oauth-protected-resource/api/mcp` and
`/.well-known/oauth-authorization-server` on the public administration origin.

## Shared kernel and permissions

The website assistant's in-memory adapter and HTTP adapter use the same MCP
server factory, tool definitions, dispatcher, data services and item writer.
There is no second data implementation. External v1 exposes built-in data tools;
website presentation tools, plugin actions and personal Google connections are
not included in this grant.

Each call checks the active human account, the approving session, client grant,
current collection/action/field/row permissions and `mcp.enabled`. Even superusers
must enable the collection for MCP. Client approvals only narrow user rights;
policy changes take effect on the next call. Related collections must also be
approved, readable and enabled. Grants store stable collection IDs, so recreating
a collection with the same name does not inherit access. System users, private
profile data, credentials and raw SQL are not exposed.

The first version requires read access to every selected collection. Write-only
fields cannot be updated through conflict preconditions. Collection membership
does not confer workspace or administrator access.

## Tools

| Task                             | Tools                                                         |
| -------------------------------- | ------------------------------------------------------------- |
| Discover permitted structure     | `list_collections`, `describe_collection`                     |
| Read records                     | `search_items`, `read_item`, `count_items`, `validate_filter` |
| Aggregate current permitted rows | `aggregate_items`                                             |
| Create one record                | `create_item`                                                 |
| Prepare and apply one update     | `prepare_update`, `update_item`                               |

Call `describe_collection` before reading or writing its records. The schema has
field types, required/null flags, readable relations, valid filter paths and
create/update field hints; row conditions are still checked when executing.
Schema descriptions persist per external connection in PostgreSQL, across Core
replicas. Queries and aggregation use the same bounds and exact-number handling
as the [website assistant](./assistant.md). Record read previews are bounded;
they are not a bulk export API.

Writes use technical field names and scalar relation IDs, ordinary validation,
audit history and transactional plugin hooks. They do not delete records, change
schema or accept nested record creation. Supply a primary key only for a text-key
collection; Core generates other key types using its ordinary creation rules.
`prepare_update` returns original typed
values for changed fields; pass them unchanged as `expectedValues`. A concurrent
change returns `ITEM_CHANGED`; review the record before preparing a new update.

Use a unique `operationId` for each intended write. After a network timeout retry
the **same arguments and ID**. PostgreSQL serializes duplicates and returns the
previous metadata result; changing arguments with that ID returns
`OPERATION_REUSED`. Cached responses contain only operation metadata, not field
values. This guarantee covers Core writes and transactional hooks; hooks must
not perform nontransactional external effects.

## Connection lifecycle

Public OAuth clients register exact HTTPS or HTTP loopback callback URLs.
Authorization uses an explicit website consent, PKCE S256, one-use 60-second
codes and the exact MCP resource. Tokens are opaque, purpose-bound and stored
only as hashes; they cannot authenticate ordinary Core API requests. Ambient
browser cookies cannot authenticate `/api/mcp` or its OAuth protocol endpoints.
Cross-origin browser clients may use their registered callback origin, with
explicit bearer credentials and without cookies.

Access tokens last at most five minutes and clients renew them with rotating
refresh tokens. The connection lasts at most 30 days, bounded by the approving
user session. Consumed code/refresh reuse revokes the connection. User suspension,
session revocation or Applications → Revoke access stops further calls and
refreshes immediately. Login through an external identity provider still uses
the same Collaborative user and its permissions. Service accounts are not
supported in v1.

Integration tests use the official MCP client against the HTTP transport and
compare it with the in-memory adapter. They cover permissions, conditional rows,
client collection scope, writes, conflicts, retries, refresh rotation and
revocation. Run them through `node scripts/test.mjs core-mcp` with a disposable
local test database.
