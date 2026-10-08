<a id="пакеты-sdk"></a>

# SDK packages

Four MIT packages are available on npm at version `0.1.0-beta.1`:

| Package                            | Purpose                                                                    | Included files          |
| ---------------------------------- | -------------------------------------------------------------------------- | ----------------------- |
| `@asmblyr-collaborative/contracts` | Shared wire contracts and translation catalogs                             | `src`, `locales`        |
| `@asmblyr-collaborative/sdk`       | HTTP client, fluent queries, plugin consumer and isolated schema generator | `dist`                  |
| `@asmblyr-collaborative/cli`       | `asm connect`, `generate`, `schema pull/check`                             | `src`                   |
| `@asmblyr-collaborative/kit`       | Plugin authoring, model contracts, UI components and build command         | `dist`, `bin`, `styles` |

Each archive also includes package metadata, README and MIT license. Explicit
file allowlists exclude tests, local configuration and intermediate work.
Install the preview with the `beta` tag. The initial beta also appears under
`latest`; this does not indicate a stable release.

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm packages:check
```

The check leaves archives in ignored `.local-data/packages`, inspects contents and
installs them into a temporary project outside the workspace. Local archive
overrides resolve the locally packed Asmblyr dependencies; the real archive metadata
contains ordinary matching versions. It checks CLI generation, offline schema
verification, standard TypeScript compilation, fluent/plugin calls and Kit export
files. It does not contact an Asmblyr installation or publish anything. Registry
access is needed to install external dependencies. Verify CI runs this check.

A consumer can use:

```sh
npm install @asmblyr-collaborative/sdk@beta
npm install --save-dev @asmblyr-collaborative/cli@beta
npx asm connect --url https://asmblyr.example.test
npx asm generate
npx asm schema check --offline
```

For local package development, use workspace commands or the checked archives. See the
[CLI guide](cli-guide.md) for browser approval, CI credentials and generated files,
and the [SDK guide](sdk-guide.md) for runtime clients. Generated code needs ordinary
TypeScript; it does not require a custom compiler or build plugin.

<a id="публикация"></a>

## Release procedure

Publication is a separate maintainer action. Run repository checks and builds,
review the packed contents and publish `contracts`, then `sdk`/`kit`, then `cli`
with the `beta` dist-tag. Update all four versions together and refresh the lockfile
before packing. Do not publish a beta as `latest`.

For automated npm releases, configure a trusted publisher for each package and
the exact GitHub Actions workflow identity, with `id-token: write`. Npm requires
Node 22.14+ and npm 11.5.1+ for this mechanism and generates provenance for supported
trusted publishing runs. The manual `publish-packages.yml` workflow runs checks,
packs the same beta version and publishes in dependency order from `main`. It
never runs on a push or pull request. Set up trust for `Asmblyr/Collaborative` and
that exact workflow filename for all four packages before running it. Registry
trust has not been configured or verified here; the maintainer must handle
organization access. A partially successful release cannot
be rolled back automatically: published versions are immutable; inspect npm before
retrying. See [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).
