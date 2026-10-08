<a id="возможности-плагина"></a>

# Plugin capabilities

<!-- languages -->

[English](CAPABILITIES.md) · [Русский](CAPABILITIES.ru.md)

<!-- /languages -->

Declare capabilities in the package's package.json:

```json
{
  "asmblyr": {
    "manifest": {
      "version": 1,
      "namespace": "comments",
      "capabilities": [
        "identity.profile",
        "items.read",
        "collections.manage",
        "storage.own",
        "hooks.items",
        "hooks.collections",
        "settings"
      ]
    }
  }
}
```

The project owner approves them by npm package name in the root package.json:

```json
{
  "asmblyr": {
    "plugins": ["@asmblyr-collaborative/plugin-comments"],
    "pluginPermissions": {
      "@asmblyr-collaborative/plugin-comments": [
        "identity.profile",
        "items.read",
        "collections.manage",
        "storage.own",
        "hooks.items",
        "hooks.collections",
        "settings"
      ]
    }
  }
}
```

Core checks all enabled packages before importing server modules. Unknown, duplicate, or unapproved capabilities stop startup. A missing list grants no additional capabilities. Project approval cannot grant something absent from the package declaration. New capabilities after an upgrade require project configuration changes; restart Core to apply declarations/approvals.

| Capability         | Access                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| identity.profile   | Current human/service actor.displayName; no email, tokens, or other profiles                                                                             |
| items.read         | Items.list/get within caller permissions                                                                                                                 |
| items.write        | Create/update/delete within caller permissions; without items.read, writes return data:null; commit requires both                                        |
| collections.manage | Install/migrate own declared collections; no arbitrary SQL or foreign tables                                                                             |
| storage.own        | Own collections through storage; plugin enforces domain conditions                                                                                       |
| hooks.items        | Items.create/update/delete hooks                                                                                                                         |
| hooks.collections  | Collections.delete hooks                                                                                                                                 |
| settings           | Declare/read own package settings                                                                                                                        |
| notifications      | Current human's record subscriptions and own-namespace inbox publish/update/remove; Core selects recipients/checks access; unavailable in model handlers |
| connections.google | Restricted personal Google broker for eligible model handlers; no credentials or automatic write confirmation                                            |

For discussions, declare and approve notifications together. See [notifications](https://github.com/Asmblyr/Collaborative/blob/main/docs/features/notifications.md). Await context.notifications.publish({ collection, item, eventId, panelId, targetId, preview }) inside context.withRecord beside the storage write. EventId deduplicates within retained inbox data. Preview is plain text up to 300 characters; arbitrary recipients/URLs are not accepted.

Basic actor.id/kind are available to authenticated endpoints without extra capabilities for authorship. Capability checks also apply to superusers. Items.write does not grant the caller write permissions. HTTP/MCP share restrictions; MCP additionally checks publication/readOnly. Model handlers never receive privileged storage.

Administrators view enabled packages and capabilities under Settings → Plugins. Approval remains project configuration, not an editable UI switch.

<a id="граница-контроля"></a>

## Control boundary

Trusted packages run inside Core. Capabilities control services supplied by Core: Kit, schema installation, hooks, and settings. Arbitrary Node code can still import networking/filesystem libraries. This is not a sandbox. Plugin UI also runs in the admin context. Install trusted packages; isolated execution is not provided.

Ordinary plugin settings are not secret storage. Secrets need a separate storage/access contract. Never retain request, items, storage, or hook contexts globally or use them in background tasks.
