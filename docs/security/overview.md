<a id="границы-безопасности"></a>

# Security boundaries

Collaborative enforces access on the server. Hiding a collection in a menu,
a view, a workspace, or field-editor metadata does not replace data permissions.
One installation serves one team; there is no company isolation within an installation.

<a id="авторизация"></a>

## Authorization

Policies define collection actions, allowed fields, and row conditions.
Settings have separate read and update grants. A superuser manages the data
schema and policy contents. Assignment of existing policies can be delegated
only within an explicitly configured set.

Service tokens are subject to data permissions and cannot manage team settings.
SSO identities are linked explicitly by provider, issuer, and subject; matching
email addresses never link accounts automatically. Invitations and recovery use
single-use links. Passkeys require the correct origin and a recent session for management.

Requirements are listed in the [access matrix](./access-matrix.md). Detailed rules
are in [permissions](../features/access.md) and [identity](../features/identity.md).

<a id="фаилы-расширения-и-ассистент"></a>

## Files, plugins, and the assistant

The file library is shared by the team. Reading a particular reference may be
authorized through an accessible record; there are no separate per-file ACLs.
The operator manages the bucket, and Core serves content after checking access.

Plugins run as trusted code. Kit restricts granted capabilities and access to
the caller's data, but does not sandbox arbitrary Node.js code. The assistant
uses the current user's permissions and collection MCP settings; the model
does not receive raw SQL access or a plugin's privileged storage.

<a id="эксплуатация"></a>

## Operations

Use HTTPS and private PostgreSQL/S3, keep configuration out of Git, and limit
access to signing keys and backups. Test migrations and recovery on a separate
copy. Production installations need their own TLS, IAM, load, and notification-delivery checks.

Automated tests cover specific scenarios and access-denial cases; passing them
is not a security certification. See [operations](../development/operations.md).
Vulnerability reporting is described in
[SECURITY.md](https://github.com/Asmblyr/Collaborative/blob/main/SECURITY.md).
