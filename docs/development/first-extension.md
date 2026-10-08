<a id="первое-расширение"></a>

# Your first plugin

This walkthrough uses the working [overview](https://github.com/Asmblyr/Collaborative/tree/main/examples/plugins/overview) example (page and HTTP endpoint) and [calculator](https://github.com/Asmblyr/Collaborative/tree/main/examples/plugins/calculator) (assistant action). Examples are not enabled in a normal installation. Start with [local setup](../guide/getting-started.md).

<a id="_1-создаите-пакет"></a>

## 1. Create a package

For a workspace package such as @asmblyr-collaborative/plugin-hello, use examples/plugins/hello, included by pnpm-workspace.yaml. Start from examples/plugins/overview without copying dist or .asmblyr.

Rename package.json name and asmblyr.manifest.namespace, then the first directory under server/api to the new namespace. It must be unique and match the first HTTP path segment. Keep exports for the root entry, ./routes, ./collections, ./package.json, and ./ui, the build script `asmblyr-plugin build`, TypeScript configuration, and Kit/H3 dependencies. Manifest version is 1. The [overview package](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/overview/package.json) contains a complete manifest.

Required plugin.ts is minimal:

```ts
import { definePlugin } from "@asmblyr-collaborative/kit";

export default definePlugin({});
```

Do not manually register routes, pages, or model handlers here.

<a id="_2-добавьте-серверныи-обработчик"></a>

## 2. Add a server handler

After renaming the namespace, server/api/hello/session.get.ts defines GET /hello/session. Keep the overview handler and shared response type:

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import type { Overview } from "../../../shared/overview.js";

export default defineHandler((event): Overview => {
  const { actor } = useAsmblyr(event);
  return {
    viewer: {
      id: actor.id,
      kind: actor.kind,
      displayName: actor.displayName ?? null,
    },
    checkedAt: new Date().toISOString(),
  };
});
```

Adapted from the [overview handler](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/overview/server/api/overview/session.get.ts). Core authenticates before invoking it. For records, use useAsmblyr(event).items or useItems(event), which enforce caller permissions. Actor.displayName requires declared identity.profile capability and separate project approval. A manifest declaration alone grants nothing. Write handlers must validate input and domain permissions.

<a id="_3-добавьте-страницу"></a>

## 3. Add a page

ui/index.ts is a separate browser entry. It must not import plugin.ts or server files.

```ts
"use client";

import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";
import { OverviewPage } from "./pages/overview-page.tsx";

export default defineUiPlugin({
  pages: [{ id: "home", title: "Overview", component: OverviewPage }],
});
```

The component's PluginPageProps request("/session") calls the namespace endpoint through the public API using the current session. Working components/hooks are in [overview](https://github.com/Asmblyr/Collaborative/tree/main/examples/plugins/overview/ui). Once installed, the page appears at /extensions/hello/home.

There are no separate UI-page permissions yet: server endpoints must check access to their own data. For record tabs and field editors, see [Kit UI](../reference/kit-ui.md) and [fields](../reference/kit-fields.md).

<a id="_4-подключите-пакет-и-права"></a>

## 4. Enable the package and capabilities

Add `"@asmblyr-collaborative/plugin-hello": "workspace:*"` to root dependencies or devDependencies, run pnpm install, and enable it in root package.json:

```json
{
  "asmblyr": {
    "plugins": ["@asmblyr-collaborative/plugin-hello"],
    "pluginPermissions": {
      "@asmblyr-collaborative/plugin-hello": ["identity.profile"]
    }
  }
}
```

This is a fragment, not a replacement: preserve built-in plugin-comments and plugin-google-workspace entries and permissions. The copied overview manifest already declares identity.profile; the root configuration separately approves it. Missing approval means no capability.

Server packages are trusted code in Core's process; capabilities do not create a sandbox. See the [capability contract](../reference/kit-capabilities.md).

<a id="_5-опубликуите-деиствие-для-ассистента-если-нужно"></a>

## 5. Optionally expose an assistant action

Ordinary H3 endpoints work over HTTP but do not appear in internal MCP. Wrap the same defineHandler in defineModelContext&lt;Input&gt;, with `defineModelAnnotation({ title, description, middleware: AccessGate.authenticated, readOnly: true })`.

A model handler must be a static .post.ts route. Kit derives input/output schemas from TypeScript and fails the build for unsupported types. See [calculator](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/calculator/server/api/calculator/calculate.post.ts) for working code and UI form.

AccessGate does not replace data authorization: use useItems(event). See [assistant architecture](./assistant-architecture.md) and [action contracts](./plugin-actions.md).

<a id="_6-проверьте-и-соберите"></a>

## 6. Check and build

```sh
pnpm --filter @asmblyr-collaborative/plugin-hello build
pnpm --filter @asmblyr-collaborative/plugin-hello typecheck
pnpm dev
```

Use your actual package name. Restart Core and UI after changing the plugin list. Sign in, open /extensions/hello/home, and verify the page request. Repository examples also support pnpm build:examples and node scripts/test.mjs core-plugins against a disposable database.

Run pnpm build before publishing. Production discovery reads dist/routes.json; UI uses the separate ./ui entry. Keep dist and .asmblyr out of Git. Collections, migrations, hooks, and settings are covered in [Kit lifecycle](../reference/kit-lifecycle.md) and [Kit hooks](../reference/kit-hooks.md).
