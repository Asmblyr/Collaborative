<!-- Generated from packages/kit/HOOKS.md; edit the source. -->

<a id="hooks-и-настроики"></a>

# Hooks and settings

`plugin.ts` remains definePlugin({}). Core discovers additional files automatically. Declare and approve [capabilities](kit-capabilities.md).

<a id="транзакционные-hooks"></a>

## Transactional hooks

Each direct server/hooks file exports one handler:

```ts
import { defineHook } from "@asmblyr-collaborative/kit";

export default defineHook("items.delete", async (event, context) => {
  context.logger.info("Record removed", {
    collection: event.collection,
    itemId: event.itemId,
  });
});
```

See packages/plugin-comments/server/services/cleanup.ts for paginated cleanup. Do not create a hook registry in plugin.ts.

| Event              | Data                             |
| ------------------ | -------------------------------- |
| items.create       | collection, collectionId, itemId |
| items.update       | collection, collectionId, itemId |
| items.delete       | collection, collectionId, itemId |
| collections.delete | collection, collectionId         |

`collectionId` identifies the collection instance; the name may later be reused. `itemId` is the saved key as a string. Hidden field values are excluded. Context includes actor, requestId, logger, items reader, approved storage, and package settings. Reads use the original caller; deleted rows cannot be reread.

Hooks run after mutation/history but before commit, in the same transaction, including storage operations. Failure rolls back data, history, and earlier hooks. Execution is sequential: configured package order, then filename order by string code units, identical in source/production.

External HTTP calls or notifications cannot be rolled back with PostgreSQL. External effects and guaranteed post-commit delivery are unsupported. Await every service call.

HTTP items, Kit, MCP, bulk, relation changes, and draft saves share this boundary. No events fire for unchanged updates, direct SQL, PostgreSQL cascades, or asmblyr*/plugin* writes. Internal-collection exclusion prevents recursive cleanup. Disabled plugins receive no events and retain data.

Production export: "./hooks": "./dist/hooks.json". The builder maintains the index. Only direct .ts files without symlinks belong under server/hooks; put helpers in server/services or a sibling directory.

<a id="работа-с-данными-привязанными-к-записи"></a>

## Record-bound data

In ordinary endpoints, context.withRecord(collection, id, async context => ...) checks reads, holds a shared record lock, and runs the callback transactionally. Use the callback's context for storage in that same transaction. This allows comment saves while preventing concurrent target deletion.

It requires items.read and is unavailable in model handlers. Do not perform slow external work inside the callback or retain its context outside.

<a id="настроики"></a>

## Settings

`server/settings.ts`:

```ts
import { defineSettings } from "@asmblyr-collaborative/kit";

export default defineSettings({
  title: "Comments",
  fields: {
    allowNewComments: {
      type: "boolean",
      label: "Allow new comments",
      default: true,
    },
  },
});
```

Use in endpoints, model handlers, or hooks:

```ts
const options = useSettings(context, settings);
// options.allowNewComments is boolean.
```

Supported types: boolean, string with maxLength, number with min/max/integer, and select options. Core validates declaration, defaults, and saved values. Unknown fields, missing values, and implicit coercion are rejected. Limits: 40 fields and 32000 JSON characters. These are ordinary settings, not secrets.

Production export: `"./settings": "./dist/server/settings.js"`. Manage them through `/settings/plugins/:namespace` and Settings → Extensions. Reads require `plugins/read` (or `plugins/update`); writes require `plugins/update`. Superusers also have access. PUT accepts `{ values, revision }`; stale revision returns 409 and preserves the UI draft. A null revision represents unsaved defaults. Restore defaults changes the draft until explicitly saved.

Values live in asmblyr_settings under plugin:&lt;namespace&gt;. New requests see changes without restart. Security audit stores actor, namespace, and changed setting names, not values. New fields receive defaults; removed fields are ignored. Incompatible type/range changes require updating stored values first: Core rejects invalid saved values rather than silently repairing them.
