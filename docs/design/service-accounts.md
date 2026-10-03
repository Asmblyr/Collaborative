# Service accounts: first implementation

Implemented on 2026-09-29. Completes the managed-key stage of
[Authentication and service identity](authentication.md).

## Administration

Superusers manage independent service identities at `/services`. Each account
has a name, description, active/disabled status and a many-to-many assignment
to existing policies. It starts without data access. There is no service
superuser flag. Human profile, policy administration, structure mutation and
personal filter presets remain human-only.

| Core endpoint | Purpose |
| --- | --- |
| GET /service-accounts | List account metadata |
| POST /service-accounts | Create an account |
| GET /service-accounts/:id | Account, assigned policy IDs and key metadata |
| PUT /service-accounts/:id | Replace name, description, status and policy IDs |
| POST /service-accounts/:id/keys | Issue a key, show secret once |
| DELETE /service-accounts/:id/keys/:keyId | Revoke key and its access tokens |
| POST /auth/service-token | Exchange a managed key for a short access token |

Account create/replace accepts `{ name, description?, status?, policyIds? }`.
Omitted description and policies are empty; omitted status is active. PUT is
a full replacement, not a partial patch. Key creation accepts `{ name,
expiresInDays? }`, with a default of 90 days and an allowed range of 1–365.
The UI offers 7, 30, 90, 180 and 365 days. Account deletion is intentionally
absent; disable an unused integration and revoke its keys.

## Runtime contract

```http
POST /auth/service-token
Content-Type: application/json

{ "key": "<asm_sk_ credential>" }
```

Returns `{ tokenType: "Bearer", accessToken, expiresIn }`. There is no refresh
token. The application caches this token until shortly before expiry, then
performs another exchange. Use the token in `Authorization: Bearer ...` for
collection/item APIs. The long-lived key cannot directly authenticate these
APIs. Send neither keys nor tokens in URLs. Use TLS outside localhost.

Keys and access tokens contain 32 random bytes, stored only as SHA-256 hashes.
Key metadata exposes a short lookup prefix, expiry, last successful exchange
and revocation time. Access tokens last at most 15 minutes, capped by the
remaining key lifetime. Revocation, key expiry and account status are checked
on each request; policies are resolved on each request as well. Already
executing requests are not retroactively canceled.

Disabling an account deletes existing access grants. Re-enabling it does not
restore those tokens; an unexpired, unrevoked key can obtain a new token.
Issuance, key revocation and account changes serialize on the account row.
Multiple keys can be active for rotation: issue the replacement, deploy it,
verify use, then revoke the old key.

The exchange endpoint allows 60 requests/minute/IP/process and returns generic
credential errors. Forwarded IP headers are not trusted by default. Before
running multiple Core instances or placing it behind a proxy, add a shared
limiter at the trusted ingress and configure proxy trust deliberately.
The browser's BFF handles management with HttpOnly user cookies and Origin
checks. Issued service secrets exist only in dialog memory, never localStorage.

## Storage and audit

The additive migration creates `asmblyr_service_accounts`,
`asmblyr_service_policies`, `asmblyr_service_keys`, `asmblyr_service_tokens`,
and `asmblyr_security_events` in public. The reserved-prefix structural guard
protects them. User tables/data are unchanged. Rollback refuses to remove
populated accounts, security history or profile names.

Item mutations use `actor_kind=service` and the stable service account ID.
Security events record the authenticated human actor for account changes,
policy assignment, key creation/revocation and password changes. Neither
audit stream contains raw credentials. Security event browsing, retention
jobs and a general auth-event pipeline are separate future work.

Expired access tokens for a key are pruned on its next successful exchange;
revocation/disable removes its grants immediately. Expired grants belonging
to permanently unused keys still need a future scheduled cleanup job.

## User settings

`/settings` is available to every authenticated person, including people with
no collection grants. It offers a persisted display name, read-only unique
email, password change, session management and synchronized appearance settings. It retains the minimal
layout for users without data access.

`GET /users/me` (also `/auth/me`) returns the public own profile. `PATCH
/users/me` accepts only `{ displayName }`. `POST /users/me/password` requires
`{ currentPassword, newPassword }`, enforces at least 12 characters for the new
password and revokes all user sessions. The browser clears both session
cookies and opens login. Login and password changes serialize on the
credential, preventing issuance based on a previously verified old password.
The password-change endpoint permits 10 requests/minute/IP/process.

Theme and table columns are now stored per user. See `user-preferences.md` and
`gitlab-federation.md` for the next implemented stage. Email changes and interactive
provider linking remain future work.
