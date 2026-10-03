# GitLab CI service federation

Implemented 2026-09-29. First provider: GitLab.com CI ID tokens.
Interactive GitLab login/linking is a separate OAuth feature and is not configured.

## Contract

- Superuser creates/revokes a binding in the service-account editor, Federations tab.
- `POST /service-accounts/:id/federations`: `{name, projectId, projectPath, ref}`.
- `DELETE /service-accounts/:id/federations/:federationId` revokes the binding and all its issued tokens.
- Account detail includes `federations`. Bindings are immutable; replace by creating a new binding.
- `POST /auth/federation-token`: `{federationId, assertion}` returns
  `{tokenType: "Bearer", accessToken, expiresIn}`. There is no refresh token.
- Policies belong to the service account. Every resource request loads current permissions.

Issuer and JWKS are pinned to `https://gitlab.com` and
`https://gitlab.com/oauth/discovery/keys`. Core needs outbound HTTPS access.
Verification uses jose, RS256 only, issuer/audience/subject, exp/iat/nbf/jti,
exact project_id/project_path AND job_project_id/job_project_path, branch name,
ref_type=branch and ref_protected="true". Merge request pipelines are rejected.
This intentionally requires modern GitLab claims (job_project_* added in 18.4).
There are no wildcard group grants, custom issuers, tags or arbitrary JWKS URLs.
Each binding gets its own random audience to prevent cross-instance/binding reuse.

Verification happens before opening the account transaction. Issuance, account
disable and revocation serialize on the service-account row. The access-token
deadline is capped at the assertion's expiry and 15 minutes. Re-enabling an
account does not resurrect old tokens. Only token hashes are stored.

The hash of issuer-scoped jti is inserted under a unique constraint, so concurrent
replays cannot both succeed. Expired entries are pruned in batches of up to 500
on exchange. Raw assertions are neither stored nor logged. Management actions
enter security history. Auth-success/failure analytics remain a separate feature.
The exchange endpoint limits body size and uses the existing 60/IP/minute/process
limiter. Multi-instance deployments need a shared ingress limiter.

## Local test setup

- Private project: https://gitlab.com/asmblyr/federation-test (ID 87017556).
- Branch: main, verified protected.
- Service account: GitLab federation test (`ccd14e01-3f3e-4f07-a6fd-17549e29b0bb`).
- Binding: `21fcb7b6-0cb6-4328-a9fd-76cb2b55db72`.
- No policies assigned; authenticated collection listing is empty.
- Example files: `examples/gitlab-federation/`, also committed to the test project.
- GitLab parsed the CI configuration; pipeline 2892210840 is waiting for manual execution.

Set `ASMBLYR_CORE_URL` to Core's runner-reachable HTTPS URL before starting the
manual job. A local runner can use HTTP loopback only when Core shares its network
namespace. Hosted GitLab runners cannot reach this computer's localhost.
No public tunnel or runner installation was performed. Live GitLab-to-Core
exchange is pending connectivity; local tests use signed RSA assertions and the
same verifier with an injected local JWKS resolver. Production has no bypass flag.

## Storage

Migration 20260929030000 adds service federations and assertion replay hashes.
Service tokens use exactly one source: key_id or federation_id, enforced in SQL.
Existing key tokens are preserved. Rollback refuses populated federations/replay
records. Expired unused tokens and security history still need scheduled retention.

References: https://docs.gitlab.com/ci/secrets/id_token_authentication/
