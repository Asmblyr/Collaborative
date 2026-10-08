<a id="сопровождение-документации"></a>

# Documentation workflow

User behavior lives in `docs/guide` and `docs/features`, architecture and operations
in `docs/development`, and security boundaries in `docs/security`. Public pages
describe current contracts, examples, and limits.

<a id="языки"></a>

## Languages

English is the default at the site root. Russian pages mirror the same paths under
`docs/ru` and are published at `/ru/`. The language menu keeps the current page.
The application has its own existing i18next catalogs; documentation localization
does not change the admin interface, API locale defaults, or application routes.

Edit both language versions when behavior changes. Package guides use English
source files and `.ru.md` counterparts. The generator copies the appropriate
version into each locale. API identifiers, examples, permissions, and limits
must remain equivalent. Translations must not turn a proposal into implemented behavior.

<a id="источники-справочников"></a>

## Reference sources

| Content                  | Edit here                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------- |
| HTTP routes              | Core handlers; the AST scanner reads declarations                                     |
| Access requirements      | `docs/reference/endpoints.json`, after reviewing handler and service                  |
| Detailed OpenAPI schemas | `scripts/docs/http-contracts.mjs` and adjacent contract files                         |
| API text translations    | Documentation translation catalogs under `scripts/docs/locales`                       |
| SDK/Kit                  | Public TypeScript types and package guides                                            |
| SDK/Kit guides           | Package README, HOOKS, FIELDS, LIFECYCLE, CAPABILITIES, UI, and `.ru.md` counterparts |

The generator produces localized OpenAPI descriptions, route matrices, package
guide copies, and TypeDoc reference pages. Do not edit generated files manually.
Internal plans, research, local reports, and private archives are not copied into the site.

<a id="проверки"></a>

## Checks

```sh
pnpm docs:generate
pnpm docs:check
pnpm docs:build
```

`docs:check` validates static Core route coverage, catalog and generated-contract
freshness, and language coverage. Site builds validate Markdown links. Dynamic
plugin routes and oidc-provider protocol endpoints are documented separately.
`route-only` means a detailed operation schema is still missing.

When changing an endpoint, review both the handler and domain authorization,
update its contract and feature page in both languages. Documentation does not
enforce access: negative integration tests verify it.

Run integration tests through `scripts/test.mjs` with a disposable database.
For shared-contract changes, run `pnpm check` and `pnpm build`. Explicitly identify
checks whose live environment was not available.
