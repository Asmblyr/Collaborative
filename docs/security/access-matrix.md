<a id="что-открыто-и-чем-защищено"></a>

# Public surfaces and access controls

A public endpoint does not require a Core Bearer token. Its protocol may still
require credentials and other verification.

| Surface                                     | Admission                             | Additional boundary                                            |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| health/ready, setup status, provider labels | Anonymous                             | No passwords, keys, or collection data                         |
| setup/login/invite/refresh                  | No Bearer token                       | Setup secret/password/single-use token, rate limits            |
| SSO start/callback                          | Provider protocol                     | Flow, state, PKCE; linking from the user's own session         |
| Service/federation exchange                 | Key/JWT assertion                     | Signature, claims, expiry, replay protection                   |
| OAuth discovery/JWKS                        | Public                                | Other OAuth endpoints perform protocol checks                  |
| Collections/items/search/history            | Active user/service                   | Action/field grants; history and relation projection           |
| DDL, folders, forms/schema metadata         | Superuser                             | Reserved prefixes, ownership, impact checks                    |
| Profile, sessions, consent                  | Human                                 | Own resource only                                              |
| Page/record participants                    | Human with read access                | Fresh row/section read check; leave only the caller's session  |
| View settings                               | Human with section read/update        | Fresh database policies; no secrets returned                   |
| Change settings                             | Human with section update             | Policies and services have the additional limits below         |
| Policy contents and permissions             | Human superuser                       | Managers can inspect existing permissions                      |
| User policy assignments                     | Human with policies/update            | Explicit personal set; no own assignments or superuser changes |
| Configure an assignable set                 | Human superuser                       | Separate user setting, not a permission                        |
| Services, their keys, and federations       | Human with services/update            | All current and new policies must be in the personal set       |
| Repeat invitations                          | Human with users/update               | Policies in the set; no own or delegating accounts             |
| File read/resolve                           | Active principal                      | Readable reference, human files/read/update, or superuser      |
| File management                             | Human with files/update, or superuser | Size, delivery/preview type, metadata validation               |
| Workspaces                                  | Human                                 | Visible collections; changes require superuser                 |
| Presets/views                               | Human with collection access          | Ownership; shared changes require superuser                    |
| Assistant                                   | Human with data eligibility           | Caller permissions, MCP enablement, tool validation            |
| Plugin HTTP                                 | Active principal and handler gate     | Kit capabilities plus caller/domain authorization              |

Superusers are not limited by an assignable set. Service tokens cannot manage
settings. Revoking the set blocks future operations but does not automatically
revoke keys or assignments already issued. See [permissions and policies](../features/access.md).

The complete declarations are in the [route matrix](../reference/routes.md).

<a id="что-не-обеспечивает-изоляцию"></a>

## What does not provide isolation

Workspaces, hidden menus/collections, a default published-record filter, UI
readonly metadata, and a tool's description for the model are not access controls.
Server checks enforce access. Knex and ordinary SQL queries do not automatically
inherit a human user's permissions.

Trusted server plugins and database administrators can bypass application checks.
There is no sandbox for arbitrary plugin code or general PostgreSQL RLS model.
