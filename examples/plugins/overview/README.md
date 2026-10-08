# Overview

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

An admin page and its own HTTP endpoint. Open Applications → Overview at http://localhost:3000/extensions/overview/home.

## Code locations

- Ui/pages/overview-page.tsx: page content; start here.
- Ui/index.ts: page ID, menu title, component registration.
- Ui/hooks/use-overview.ts: load, cancellation, errors, retry.
- Server/api/overview/session.get.ts: current-actor endpoint.
- Shared/overview.ts: response type.
- `plugin.ts`: required server entry.

PluginPageProps from `kit/ui` supplies request("/session"), calling /api/overview/session with the user's session. Direct Core: GET http://localhost:3001/overview/session with a Bearer token. Tokens/server modules never reach the component.

Shared Button comes from `kit/ui`/button. See [Kit UI](../../../packages/kit/UI.md). The example displays only the caller's ID, name, actor kind, and response time. It reads no collections, creates no tables, and saves no settings. Add record operations through useAsmblyr(event).items under caller permissions.

## Development

The package is disabled by default; follow [example setup](../README.md), then run pnpm dev. Start PostgreSQL with pnpm db:up. Next handles TSX changes; Core's watcher handles API changes. New packages require restarting both dev servers. Production needs pnpm build and service restart.

Change the title in ui/index.ts. Register another pages entry with a different ID to add its menu/route automatically. IDs use lowercase Latin letters, digits, and hyphens, beginning with a letter. Routes always use /extensions/&lt;namespace&gt;/&lt;id&gt; and cannot override built-ins.

## Current limits

Pages require authenticated users admitted by the existing admin layout; users without minimum access retain the no-access screen. Separate plugin-page grants are unsupported. The endpoint independently validates the session and returns only its caller's context.

Nested/dynamic routes and UI loading without rebuilding are unsupported. OnStateChange reports unsaved state to protect against assistant form replacement and warn on reload. A universal guard for normal menu navigation is not yet implemented. This read-only example has no unsaved forms.
