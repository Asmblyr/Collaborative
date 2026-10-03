# Working in Asmblyr Collaborative

Read the applicable rules before changing code:

- [Architecture and data safety](.agents/rules/architecture.md).
- [Code quality and verification](.agents/rules/quality.md).
- [Documentation and public contracts](.agents/rules/documentation.md).
- [Plugin contracts](.agents/rules/plugins.md) when changing Kit, extensions, or assistant integration.

More specific `AGENTS.md` files apply within their directories.

Work only in this repository. Preserve user data and existing migrations. Never
commit credentials, local evidence, private plans, or generated builds. Run
integration tests through `scripts/test.mjs` against its disposable database.

Make routine reversible changes autonomously. Use existing user decisions;
raise unresolved product or security decisions with a concrete recommendation.
Report the result, relevant checks, and any remaining limitations.
