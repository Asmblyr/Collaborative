# Authentication and service identity

Status: staged implementation; remaining proposals are identified below. First-user setup through the UI,
protected by a one-time setup secret, plus password login,
opaque user access/refresh tokens, rotation, logout, and administrator-created
user invitations are implemented. Invitations expire after seven days and
let users set their own password; the UI shows the link once for manual delivery.
Core collection and item routes now require an active access token. The UI uses
HttpOnly access and refresh cookies, password login, token renewal, and logout.
Managed service keys, GitLab.com CI federation, own-session management and personal UI preferences are implemented.
Interactive OAuth2/OIDC provider login and explicit profile linking are implemented;
see [configuration and current scope](interactive-sso.md). Public self-registration
and SSO-only invitation acceptance remain separate future features.

## Purpose

Core should identify both people and services before applying permissions or
writing an audit event. A person's account must survive a change of login
provider. A service must be able to use either a managed key or a trusted
workload identity without borrowing a person's account.

Authentication answers _who is calling_. Authorization answers _what this
principal may do_. A virtual workspace only organizes collections in the UI;
selecting one never grants or removes API access.

## Principals and identities

- A **user** has a stable internal ID, status, and profile. Local password,
  GitHub, GitLab, VK, OIDC, and a future LDAP integration are ways to identify
  the same user. Credentials and external identities are separate records.
- A **service account** has its own stable ID and status. Administrators manage
  its keys, federation bindings, and permissions. It does not depend on an
  employee account remaining active.
- An external user identity is keyed by a configured provider plus its stable
  issuer and subject (or equivalent provider-specific ID). Email is profile
  data and is never sufficient for automatic account linking.
- Each user has one normalized, unique email. A new provider account can create
  a user only when it supplies a verified email that is not already in use.
  If the email is taken, the person must sign in to that existing account and
  link the provider from their profile. A provider's later email change does
  not automatically change the user's email in Asmblyr.
- A workload federation binding maps an exact trusted external identity to
  one service account. Trusting an issuer alone must not automatically create
  service accounts or grant their permissions.

Core owns account creation, linking, disabled-state checks, token issuance,
revocation, and audit identity. Providers verify credentials or assertions and
return a stable verified identity; they do not assign Core permissions.
Registration policy is separate from authentication. The recommended default
is administrator creation or invitation, with self-registration as an explicit
future option. The first superuser is created through the admin UI with a
configured setup secret, without a built-in password.

## Login and token flows

| Caller                                               | Proof presented to Core                        | Result                                                                  |
| ---------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| First-party user interface                           | Username/password over TLS                     | Asmblyr access and refresh grant for a user                             |
| User through GitHub, GitLab, VK, or another provider | Provider authorization callback                | The same Asmblyr user grant; provider tokens are not Asmblyr API tokens |
| Service account with a managed key                   | Key presented to a token endpoint              | Short-lived Asmblyr access token; no refresh token                      |
| Federated workload                                   | Short-lived assertion from a configured issuer | Short-lived Asmblyr access token; no refresh token                      |

Interactive OAuth providers should use Authorization Code with PKCE and state;
OIDC flows also validate the ID token and nonce. Providers do not all implement
OIDC, so OAuth user login and OIDC user login need provider-specific verification
behind one Core account-mapping step. Account linking requires an authenticated
user action from the signed-in profile, regardless of whether the original
sign-in method was a password or another provider. Matching email is
insufficient.

The password API is for interfaces we control. A third-party application
should not collect an Asmblyr password. Supporting third-party applications
later would require Asmblyr to offer an authorization flow with client
registration, consent, and Authorization Code with PKCE. That is a separate
feature from logging into Asmblyr through an external provider.

A service key should be used to obtain a short-lived access token, rather than
sent to every resource endpoint. A federation exchange validates an allowlisted
issuer, signature and current signing key, intended audience, validity window,
and the explicitly bound subject. GitLab user login and a GitLab CI workload
are different trust configurations even if they share a brand. The external
assertion is never treated directly as an Asmblyr access token.
All credential exchanges require TLS outside local development. Password and
token endpoints need rate limits and generic failure responses; provider
redirect destinations must be registered and matched exactly.

## Token storage and lifecycle

- Use cryptographically random, opaque bearer tokens. Start with server-side
  validation in Core; a signed JWT is unnecessary while Core is the sole API
  verifier. This keeps revocation and permission changes effective immediately.
- Human access tokens should be short lived (initial target: 10–15 minutes).
  Refresh grants can last longer (initial target: up to 30 days) and belong to
  a specific device/client session. Final durations are configuration choices.
- Store only hashes of access tokens, refresh tokens, and service keys in
  PostgreSQL, plus owner, grant/credential ID, issue and expiry times, and
  revocation state. High-entropy tokens can use SHA-256; passwords require
  a password KDF such as Argon2id with versioned parameters.
- Rotate a refresh token atomically on every successful use. Retain its family
  relationship so confirmed reuse of an old token revokes the family. Design
  retry/concurrency handling before implementation so a lost response does
  not inadvertently log out a legitimate client.
- Support multiple active service keys per account for zero-downtime rotation.
  Show a new key once, give it a lookup prefix/ID, and retain only its hash.
  Keys need expiry, explicit revocation, and last-used metadata.
- Disabling a principal, changing a password, or revoking a grant must prevent
  further use of its tokens. Never log raw credentials or return them again.
  Token responses should use `Cache-Control: no-store`.
- Keep provider-issued tokens only for the duration of login. If a future
  connector must call an upstream API on a user's behalf, store those tokens
  as a separate encrypted secret with its own lifecycle.

The token-issuing API can return access and refresh tokens to trusted native or
server clients, which must use secure storage. For browser interfaces, prefer a
backend-for-frontend or an HttpOnly, Secure refresh cookie; keep access tokens
out of localStorage. Cookie-backed operations need CSRF and Origin protection.
Core should decide token transport from a configured, trusted client type,
not an arbitrary request parameter, without changing the underlying grant
and revocation rules.

Federated user login is proof at login time, not continuous proof that an
upstream account remains enabled. Enterprise deployments will need a bounded
session lifetime and, when required, deprovisioning or logout integration.

## Authorization and audit

Outbound OAuth/OIDC applications are now implemented as a separate module. They
authenticate users to external services and do not reuse Asmblyr API tokens or
grant collection access. See [OAuth application contracts](oauth-applications.md).

Every protected Core route should receive a resolved user or service account
and evaluate permissions there. Service accounts start with no data privileges;
their key or federation method cannot bypass authorization. Workspaces remain
UI organization, not a permission boundary.

Item history has `actor_kind`, `actor_id`, and `request_id`. User item changes
now populate these from the verified request context. Separate security audit
events should cover login, failed login, account linking, key creation and
revocation, and federation configuration changes without storing secrets.

## Extension boundary and implementation order

Keep interactive user providers and workload assertion verifiers as distinct
interfaces. Both return a verified external identity to Core; Core performs
mapping, token issuance, and authorization. Build the contract around real
providers before publishing a general plugin API or dynamic loader.

1. Add principals, local password login, user grants, refresh rotation, route
   authentication, and verified actors in item history.
2. Add service accounts, key exchange, key lifecycle, and explicit permissions.
   Implemented for managed keys; see [current API and lifecycle](service-accounts.md).
3. Integrate one real workload issuer with exact service-account binding.
4. Integrate one interactive OAuth/OIDC provider, then refine the provider
   contract for additional providers and LDAP.

Before implementation, confirm which external interfaces are first-party,
the initial workload issuer, registration policy, and the first permission
model. These choices affect the public API and bootstrap path.
