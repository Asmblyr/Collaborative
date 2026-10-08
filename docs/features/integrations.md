<a id="сервисы-федерации-и-oauth-приложения"></a>

# Services, federations, and OAuth applications

<a id="сервисные-аккаунты"></a>

## Service accounts

Assign policies to a service account. A key secret is shown once; only its hash is stored. `POST /auth/service-token` exchanges it for a Bearer token lasting up to 15 minutes, without refresh. Subsequent requests check key revocation and account status.

Each key shows issuance time, expiry, last activity, and API request count. Activity includes successful key-to-token exchange and HTTP requests with a successfully validated token from that key. The count increments once per such HTTP request, even if permissions later reject the operation. Token issuance, invalid/expired/revoked tokens, requests without service-token verification, and federated tokens are excluded.

Statistics load when opening the account; activity predating their introduction is not reconstructed. `GET /service-accounts/:id` and key-issuance responses contain `createdAt`, `lastUsedAt` (last exchange), `lastActivityAt`, and `requestCount`. The counter is a decimal string preserving PostgreSQL bigint precision. New keys start at `"0"`. Migration seeds old keys' activity from their known exchange time and leaves counters at zero. Revocation and disabling preserve statistics; rollback refuses to discard recorded statistics.

Viewing requires services/read or update; changes require services/update. For managers, all current and requested service policies must belong to their personal delegation set. Keys and federation changes use the same check. A service with a protected policy is read-only. See [bounded delegation](./access.md#bounded-policy-delegation).

Service tokens use data permissions, not human settings/profile access. Reducing a manager's allowed set does not automatically revoke previously issued keys; administrators revoke them separately.

## GitLab CI federation

The supported issuer is `https://gitlab.com`. Checks cover RS256, issuer, audience, subject, project/job-project ID and path, protected branch, validity times, and jti. Merge-request pipelines are rejected. A database jti hash blocks assertion replay.

This signs a service into Collaborative; it is not a general catalog of OIDC issuers. Core's Yandex Object Storage federation is separate infrastructure-account configuration.

<a id="asmblyr-как-oauth-oidc-provider"></a>

## Collaborative as an OAuth/OIDC provider

The OAuth section creates applications that let external services authenticate through a Collaborative account. The base profile is fixed: ID, email, name, and optional picture. Admission can use configured user/email-domain rules or allow all eligible users.

Consent is stored per user/application. Existing grants avoid repeated consent for already approved scopes. Users can revoke applications in their profile. Application OAuth tokens are not Core API tokens.

`oidc-provider` serves `/oauth/*`. Obtain protocol endpoints from discovery, not the static REST matrix. Administrative `/oauth-apps` and `/oauth-interactions` routes are documented separately.

<a id="доступ-через-политики"></a>

### Policy-managed access

Enable Manage access through policies on the application's Access tab. On Integration, configure Audience and the permission catalog: a technical service value and a readable editor label. The catalog itself grants nothing.

In a policy's Applications tab, allow sign-in, select permissions, and assign the policy to users. User policies combine grants. Without a matching policy, sign-in is denied even to a Collaborative superuser.

While this mode is enabled, old user/domain admission rules do not participate. Disabling it restores those rules; policy assignments remain stored but unused. Review the previous admission mode before switching off. Existing applications keep their behavior: migration does not enable policy management automatically.

In policy mode, the application requests only `openid profile email`. Core adds personal permissions to its signed access token:

```json
{
  "aud": "lavinmq",
  "scope": "openid profile email",
  "resource_access": {
    "lavinmq": { "roles": ["lavinmq.tag:monitoring"] }
  }
}
```

The external service must understand this claim; there is no universal conversion to every service's policy format. For LavinMQ, set `resource_server_id = lavinmq`, `audience = lavinmq`, `verify_aud = true`, and `mgmt_scopes = openid profile email`. Remove shared service scopes from the sign-in request. Management tags and vhost/resource permissions follow separate LavinMQ rules.

Consent displays personal permission labels. Adding rights requires new consent. If rights change while confirmation is open, Core returns 409; restart sign-in to review current rights. Code exchange rechecks access and intersects current rights with consented rights, preventing a pending sign-in from receiving newly added permissions.

Changes apply when issuing a new token. External services may accept an existing JWT until expiry, five minutes, and manage active connections under their own rules. LavinMQ users remain OAuth identities; local broker accounts are not created.

Application REST fields are `policyManaged` (default false), `scopes` (catalog), and `scopeLabels` (value → label). Omitting policyManaged or scopeLabels on update preserves them. Removing a catalog value removes policy assignments for it; adding it back does not restore old grants. Changing Audience or access mode resets consent.

A local LavinMQ example is available. Its live test requires a running container and is not part of the ordinary full suite. Localhost HTTP allowances are not production settings: external issuers need HTTPS, persistent signing keys, and correct proxy/origin configuration.

<a id="личные-подключения-google"></a>

## Personal Google connections

[Google Workspace](./google-workspace.md) uses a separate OAuth client for the assistant, encrypted personal tokens, and confirmation before external writes. It is separate from SSO login and from applications using Collaborative as their OAuth provider.
