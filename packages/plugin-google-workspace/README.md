# Google Workspace assistant tools

The admin extension list displays **Google Workspace** using this package's RU/EN
translation catalogs. Its API namespace stays `google`.

Optional Asmblyr plugin for personal Google Drive and Sheets connections.
It provides five typed H3 model routes: find files, read text, describe a sheet,
read a cell range, and propose a write. Core owns OAuth, encrypted credentials
and the human approval step; the plugin never receives Google tokens.

Add `@asmblyr-collaborative/plugin-google-workspace` to the installation's `asmblyr.plugins`
and approve `connections.google` in `asmblyr.pluginPermissions`. Build with
`pnpm --filter @asmblyr-collaborative/plugin-google-workspace build`.

See [Google Workspace setup and limits](../../docs/features/google-workspace.md)
and [plugin action contracts](../../docs/development/plugin-actions.md).
