# Plugin examples

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

Three small packages demonstrate Kit:

| Package                            | Example                                   |
| ---------------------------------- | ----------------------------------------- |
| [calculator](calculator/README.md) | Typed model handler, form, assistant call |
| [color](color/README.md)           | Field editor/display with settings        |
| [overview](overview/README.md)     | Admin page and current-caller endpoint    |

They belong to the development/test workspace but are disabled by default. The bundled Comments plugin is under packages/plugin-comments. This directory's package.json is test configuration, not ordinary app configuration. Pnpm build builds the app without demonstration packages.

## Enable an example locally

Run pnpm build:examples from the root, then add the desired package to root asmblyr.plugins. Overview also needs identity.profile approval in asmblyr.pluginPermissions; Calculator/Color need no capabilities. Preserve existing package approvals.

Restart Core/UI. To disable, remove the example from asmblyr.plugins and rebuild UI. Color fields remain ordinary text. Do not include local example configuration changes in pull requests.

## Check contracts

```sh
pnpm build:examples
node scripts/test.mjs core-plugins
```

Test configuration explicitly enables examples. Source/production loaders share one manifest. Generated schemas and dist stay out of Git.
