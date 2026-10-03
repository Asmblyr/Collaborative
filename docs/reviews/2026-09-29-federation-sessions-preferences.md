# Review: federation, sessions and user preferences

- Three additive migrations applied locally (batches 22–24). Existing data and
  credentials preserved. Destructive rollbacks not run; down paths refuse data loss.
- New feature modules are below 100 lines; changed workspaces remain below 250.
- Self-review covers token source exclusivity, bounded replay cleanup, assertion
  expiry, account/revoke locking, own-session boundaries, field projection and
  per-property preference writes. Routes remain thin.
- Core and UI typecheck/lint passed. Twelve targeted tests passed, including
  RSA signature/context validation, concurrent replay, disable/revoke lifecycle,
  session ownership and refresh race, preference isolation/schema reconciliation,
  previous key/profile behavior and live UI/BFF calls with disposable fixtures.
- Browser inspected profile/security sessions and the real private GitLab project.
- Test project created and CI example committed. Protected main verified via GitLab;
  pipeline is manual, job not executed because runner-to-Core connectivity is unset.
- GitLab OAuth login/linking is pending application credentials/configuration.
- Follow-up: scheduled retention, shared rate limit for multi-instance deployment,
  complete named views and interactive provider linking.

Baseline backup used for review:
`%TEMP%/asmblyr-federation-20260929-115443`.
