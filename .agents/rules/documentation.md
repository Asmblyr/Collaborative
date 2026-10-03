# Repository rules

## Documentation is part of the change

- Start from `docs/index.md` and the relevant `docs/features/` page. Current
  behavior lives in `guide`, `features`, `development`, `reference`, and `security`.
  Keep internal plans, research and dated work reports under ignored `.local-data/`.
  Do not add them to public docs or copy them into the documentation site.
- Update current documentation in the same change when modifying a feature,
  authorization boundary, route, SDK/Kit contract, configuration or migration.
  Describe implemented behavior, permissions, limits and verification separately
  from proposals. Never include real tokens, credentials or private user data.
- For HTTP changes, review `docs/reference/endpoints.json` against the handler
  AND the service. Keep `public` and the access description accurate. Add detailed
  contracts to `scripts/docs/http-contracts.mjs` where applicable. `route-only`
  is an explicit incomplete contract; never present it as a typed client schema.
- For SDK/Kit changes, edit public TypeScript and package guides. The documentation
  generator copies guides and runs TypeDoc; do not edit generated reference files.
  Keep examples aligned with the agreed H3/file-route/model-context architecture.
- Run `pnpm docs:generate` and `pnpm docs:check` for contract changes. Run
  `pnpm docs:build` after changing documentation structure, generators or public
  types; this must also pass before reporting a documentation task complete.
  Fix broken links instead of disabling dead-link checks. Review newly generated
  API coverage and preserve the explicit OAuth/plugin dynamic-route exclusions.
- Verify security claims with negative tests. The route catalog describes access;
  it does not enforce it. Run integration tests only through `scripts/test.mjs`
  against its disposable local database. Record passed, skipped and unverified
  scopes honestly in the change summary or private audit output.
- For new findings, update the current limitation on its feature page. Keep
  internal investigation evidence in private output, not in the public catalog.
  Documentation commands and ownership are in `docs/development/documentation.md`.
