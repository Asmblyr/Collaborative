# Review: service keys, profile and navigation

## Implemented

- Reduced folder child indentation; restored stock shadcn subitem sizing and
  active state. Floating sidebar and collapsed folder dropdowns are preserved.
- Shared compact page header for collection structure, records, services and
  settings. Removed duplicate record headers and the normal-operation Core badge.
- Independent service accounts, reusable policy assignments, expiring managed
  keys, one-time secret display and revocation in a native side dialog.
- Key exchange to 15-minute opaque service tokens; live grant resolution and
  service actors in the existing transactional item history.
- Own profile and password APIs, settings page, local light/dark/system themes,
  profile access even for users without collection grants.
- Password changes invalidate all sessions. Login rechecks the credential
  under the password-change lock to prevent issuance using a replaced password.

## Checks completed

- Applied additive migration `20260929020000_services_and_profile.cjs` on the
  existing local database (batch 21). No user collection DDL/data changes.
- Core + UI TypeScript and ESLint passed after final source edits.
- 17 focused tests passed across services, profile, relation editor, existing
  collection access, personal filter presets and the live UI/BFF smoke test.
- Service tests cover default denial, human-only routes, field grants, immediate
  policy changes, audit actor, rotation, revocation, disabling, re-enabling,
  expiry, no refresh, secret omission and exchange rate limiting.
- Profile tests cover self-only updates, rejecting privilege/email mutation,
  current-password proof, session/refresh invalidation and new-password login.
- The live UI/BFF test checks rendered settings for a user with no grants,
  profile save, foreign Origin rejection, service creation/key issuance/revoke,
  and cookie clearing after a password change. Fixtures are removed in finally.
- Browser screenshot checked the collection header and sidebar indentation.
  New profile/service dialog click flows, mobile layouts and clipboard behavior
  have not received a complete browser walkthrough.

Reproduction from `apps/core`:

```powershell
pnpm exec tsx --test --test-concurrency=1 test/services.integration.test.ts test/profile.integration.test.ts test/relation-editor.integration.test.ts test/access.integration.test.ts test/filter-presets.integration.test.ts
$env:ASMBLYR_UI_TEST_URL='http://localhost:3000'
pnpm exec tsx --test test/settings-ui.integration.test.ts
```

## Review boundaries

The checkout has no tracked baseline, so changes were compared against the
pre-edit backup and focused new modules were read directly. Existing auth,
permission and relation behavior was retained. New files stay below 250 lines.
Migration rollback refuses populated account/audit/profile data; it was reviewed
without running a destructive rollback on the development database.

Before a multi-instance deployment, use shared ingress rate limiting. A future
maintenance job must prune expired grants from inactive keys and apply a chosen
security-audit retention policy. Federation, provider linking, cross-browser
preferences, service-account deletion and security-event UI remain separate
features. API details and these boundaries are in
[service-accounts.md](../design/service-accounts.md).
