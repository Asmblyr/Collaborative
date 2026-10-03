# Interactive SSO

Implemented: environment-configured OpenID Connect and OAuth 2.0 providers,
explicit profile linking, sign-in through linked identities, and unlinking with
protection against removing the last available sign-in method. GitLab.com is the
first local provider, using key `gitlab` and the OIDC driver.

## Configuration

Core reads a comma-separated `AUTH_PROVIDERS` list and an `AUTH_<KEY>_*` block
for each entry. Keys use lowercase letters, digits and underscores, start with a
letter and have at most 48 characters. Keys are stable identity namespaces, not
display labels. Changing a key does not migrate existing account links.

```dotenv
AUTH_PROVIDERS=gitlab
AUTH_UI_URL=http://localhost:3000
AUTH_GITLAB_DRIVER=openid
AUTH_GITLAB_LABEL=GitLab
AUTH_GITLAB_ISSUER_URL=https://gitlab.com
AUTH_GITLAB_CLIENT_ID=<application-id>
AUTH_GITLAB_CLIENT_SECRET=<secret>
AUTH_GITLAB_SCOPE=openid profile email
AUTH_GITLAB_CLIENT_AUTH_METHOD=client_secret_post
```

`AUTH_UI_URL` is the public origin of the admin interface. HTTPS is required,
with HTTP permitted only for loopback development. Provider endpoints require
HTTPS. The issuer is its exact base issuer URL, including any realm path; it is
not the discovery document URL. Callback addresses are derived from the origin
and configured key, never from untrusted forwarded hosts:

```text
http://localhost:3000/sign/sso/gitlab/callback
```

Register a confidential web application with Authorization Code and PKCE S256.
For GitLab OIDC enable `openid`, `profile`, and `email` scopes. No GitLab repository
or write API scopes are needed. Secrets remain in Core's ignored `.env` or server
environment. Restart Core after changing environment configuration.

`AUTH_<KEY>_CLIENT_AUTH_METHOD` supports `client_secret_basic` (default) and
`client_secret_post`. `LABEL` defaults to the key. OIDC `SCOPE` defaults to
`openid profile email`; OAuth2 scope must be chosen for that provider.

The local GitLab.com application uses `client_secret_post`. Live verification
found that `client_secret_basic` returned `invalid_client` for these application
credentials, while `client_secret_post` accepted them. Keep this choice explicit
per provider rather than retrying the exchange with different authentication methods.

For OAuth2 also configure `AUTHORIZE_URL`, `ACCESS_URL`, `PROFILE_URL`, and
optionally `IDENTIFIER_KEY` (default `id`, dotted JSON paths supported). The
profile endpoint must accept a bearer access token and return a stable account
identifier as a string or safe integer. Email and mutable usernames are not
suitable identifiers. PKCE is mandatory. Providers requiring special profile
requests or nonstandard flows need a dedicated adapter; arbitrary OAuth
services are not automatically identity providers.

Public provider metadata includes only key, label and driver. Multiple entries
can use the same issuer or driver with different application credentials.

## Sign-in and linking

1. A same-origin form POST to `/sign/sso/:provider` starts the flow in Next.js.
2. Core creates a 10-minute attempt with PKCE, state and, for OIDC, nonce.
   A separate random HttpOnly SameSite=Lax browser cookie binds the callback.
3. The provider redirects to `/sign/sso/:provider/callback` on the UI host.
4. Core checks the attempt, browser binding, provider and configuration, consumes
   it atomically, and exchanges the code. OIDC verifies the signature through
   JWKS, issuer, audience, expiry and nonce through `openid-client`.
5. A linked identity receives the existing opaque Asmblyr access/refresh token
   pair. Next.js sets the existing HttpOnly cookies and redirects locally.

Only the most recently started attempt for a provider in a browser can finish.
Callbacks use GET/query response mode. Form-post, implicit and device flows are
not included. The callback sends no provider tokens to browser JavaScript.

Users connect providers under **Settings → Security → Connected accounts**.
Linking requires the same active Asmblyr user session at start and completion.
A provider identity is unique by `(provider, issuer, subject)`, with one identity
per user per configured provider. Concurrent attempts cannot claim the same
identity for different accounts. Unlinking requires another configured identity
or a password credential. Unlinking does not revoke existing Asmblyr sessions;
the user can revoke them separately in the same security page.

Adding a provider does **not** enable self-registration. Unknown external identities
must first sign in through an existing method and explicitly link the provider.
Email matching never attaches identities, creates accounts, changes local email,
or changes permissions. Invitations currently retain their existing password
activation flow. SSO-only invitation acceptance and public registration are separate
future features.

## Data and operational behavior

- `asmblyr_user_identities` stores identity mapping, without provider tokens or
  profile copies. The existing normalized unique local email remains authoritative.
- `asmblyr_auth_flows` stores short-lived authorization attempts. State and browser
  secrets are hashed. The PKCE verifier is transient plaintext needed for code
  exchange; it is deleted on consumption. Expired attempts are rejected immediately
  and removed when another flow starts, even if the old callback never arrives.
- Link, unlink and successful SSO login are written to the security event log.
  No provider code, access token, refresh token or profile is logged there.
- The migration adds two tables without modifying user data. Rollback refuses
  to remove existing linked identities.
- Provider errors are sanitized. Credentials and provider response bodies are
  never forwarded in error messages. Start/callback endpoints are rate limited.
- Next.js development logs exclude callback URLs. Production reverse proxies
  must likewise exclude callback query strings from access logs. Callback
  responses use `no-store` and `Referrer-Policy: no-referrer`.
- `gitlab` is a configured label/key, not a GitLab group membership restriction.
  Access follows the linked Asmblyr account's policies. GitLab groups do not
  automatically assign permissions.
- Provider logout/deprovisioning does not immediately revoke local sessions;
  back-channel logout and SCIM are not implemented.

## Directus comparison

Reviewed public documentation and source on 2026-10-02:

- [Configuration](https://directus.io/docs/configuration/auth-sso):
  `AUTH_PROVIDERS` with `AUTH_<PROVIDER>_DRIVER`, credentials, scope and label.
- [Provider registration](https://github.com/directus/directus/blob/main/api/src/auth.ts):
  provider keys select independent configured driver instances.
- [OIDC driver](https://github.com/directus/directus/blob/main/api/src/auth/drivers/openid.ts).

We use the same explicit env naming convention. Our provider identities remain
separate records so one user can link several providers. We do not use email as
the external identity key or import roles from the provider. Unlike Directus's
documented `ISSUER_URL`, ours takes the issuer base URL and performs discovery.

## Verification

`node scripts/test.mjs core-sso` runs protocol and route tests in a disposable
PostgreSQL database. The mock HTTPS provider signs actual JWTs; tests cover
OIDC signature/issuer/audience/nonce/expiry, OAuth2 profile IDs, PKCE, browser
binding, one-time callback consumption, explicit linking, unique identities,
disabled users, ordinary session refresh, retained permissions and unlink guards.

Live verification on 2026-10-02 completed after the user's consent: GitLab
`gitlab` was linked to the existing local account, then the user was signed out
of Asmblyr and signed back in through the GitLab button. The callback returned
to the admin interface with the same local email and permissions.

The initial live exchange exposed GitLab rejecting `client_secret_basic` with
`invalid_client`; setting this provider to `client_secret_post` resolved it.
Regression tests cover both client authentication methods. Core logs sanitized
protocol codes, known claim names and HTTP statuses for future diagnosis,
without exception messages, response bodies, authorization codes or tokens.
