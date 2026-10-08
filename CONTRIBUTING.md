# Contributing

<!-- languages -->

[English](CONTRIBUTING.md) · [Русский](CONTRIBUTING.ru.md)

<!-- /languages -->

Report bugs and proposals in [GitHub Issues](https://github.com/Asmblyr/Collaborative/issues). Create a branch and pull request for code changes. Discuss substantial architecture, data-model, or public-contract changes in an issue first.

## Setup

Follow [first-time setup](docs/guide/getting-started.md), [local development](docs/development/local-development.md), and [your first plugin](docs/development/first-extension.md). Repository development uses workspace packages; published SDK/CLI previews use the beta tag. See [architecture](docs/development/architecture.md).

Never commit environment files, keys, user data, dumps, local screenshots, internal plans, or generated builds. Use fictional data and example.test domains.

## Checks

```sh
pnpm check
pnpm build
```

Integration tests run through scripts/test.mjs, which creates/removes a disposable PostgreSQL database. TEST_DATABASE_ADMIN_URL needs a local server and CREATEDB role. Never run test files directly against a working database. The optional live LavinMQ test needs a separately configured broker.

Format changed files with Prettier. Update feature guides with behavior changes; update HTTP/SDK/Kit contracts and generated references with API changes. See [documentation workflow](docs/development/documentation.md).

## Pull requests

Describe the problem, resulting behavior, and checks. Verify UI with ordinary and restricted access using fictional data. Add new migrations rather than rewriting old ones; preserve existing data. Avoid unrelated refactors.

Coding-agent instructions start at [AGENTS.md](AGENTS.md). Contributions use the [MIT license](LICENSE).
