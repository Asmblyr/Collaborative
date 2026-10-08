<a id="карта-возможностеи"></a>

# Feature map

This table describes the current implementation. The limits column records
feature boundaries; it does not promise dates for future changes.

| Area          | Implemented                                                                                                                                        | Limits                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Collections   | Creation, single/multiple mode, key types, fields, labels, forms, indexes, search, system dates and status; import of read-only materialized views | Import of arbitrary existing tables or ordinary views; database migration as a product feature |
| Records       | Tables, pagination, sorting, columns, side-panel editor, record URLs, bulk actions, atomic drafts, live invalidation                               | External SQL does not produce live events                                                      |
| Relationships | M:1, inverse 1:M, M:N through junctions, select/create/unlink, relationship fields                                                                 | Arbitrarily deep nested queries are not guaranteed                                             |
| Filters       | AND/OR groups, typed conditions, relationship fields, saved views                                                                                  | Permission conditions use direct fields, AND/OR, and request-principal parameters              |
| Access        | Collection actions/fields/conditions, reusable permissions, M:N policies, settings read access, bounded assignment of existing policies            | DDL remains superuser-only; no per-object file ACL                                             |
| Users         | Setup, invitation links, passwords/passkeys, profile, sessions, SSO, administrator-assisted recovery                                               | No separate MFA flow, self-service email recovery, or LDAP/SAML                                |
| Integrations  | Service accounts/keys, GitLab CI federation, built-in OAuth/OIDC provider                                                                          | No universal federation for arbitrary issuers or public MCP endpoint                           |
| Files         | S3/YC, metadata, references, files/read and update, read checks                                                                                    | No per-object ACL, antivirus/transformation pipeline, or DB/S3 reconciliation                  |
| Workspaces    | Switcher, collection sets, per-user selection                                                                                                      | Not tenant isolation                                                                           |
| Assistant     | Context, streaming, tools, model handlers, telemetry, shared limits, optional retention                                                            | Provider spending limits remain external; resistance to prompt injection is not proven         |
| Plugins       | pnpm/local packages, H3 file routes, typed Kit, migrations, hooks, UI/fields/settings, MCP annotations                                             | No sandbox, marketplace/UI installation, or guaranteed external event delivery                 |
| SDK           | HTTP items list/get/create/update/delete/commit, users.me, presence and realtime/locks; schema generation and fluent queries through the CLI       | Not every system endpoint has a dedicated client wrapper                                       |
| Collaboration | Baseline checks, conflict resolution, SSE presence, live updates, TTL field locks                                                                  | Comments and policy changes are not synchronized through the live protocol                     |
| Protocols     | HTTP and SSE; separate OIDC protocol                                                                                                               | No general GraphQL API                                                                         |

Feature pages explain the details. Access requirements are in the
[access matrix](../security/access-matrix.md).
