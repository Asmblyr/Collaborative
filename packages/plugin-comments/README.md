# Comments

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

Bundled record discussions with real authors, self-editing, and a record-card tab.

## Structure

The old @asmblyr/kit workspace alias remains only for an immutable historical migration. New modules use @asmblyr-collaborative/kit.

| Location                                    | Responsibility                                 |
| ------------------------------------------- | ---------------------------------------------- |
| plugin.ts                                   | Required definePlugin({})                      |
| server/collections/entries.ts               | Current plugin_comments_entries declaration    |
| server/migrations/20261002060000_authors.ts | Author fields/index                            |
| server/hooks/                               | Transactional record/collection cleanup        |
| server/settings.ts                          | New-comment switch and length limit            |
| server/api/comments/[collection]/[item]     | Thin HTTP routes                               |
| server/schemas/comments.ts                  | Single HTTP input validation                   |
| server/services/comments.ts                 | CommentsService operations/access              |
| server/presenters/comment.ts                | Typed storage row → public response            |
| shared/comments.ts                          | Contracts, text limits, supported collections  |
| ui/index.ts                                 | DefineUiPlugin browser entry, exported as ./ui |
| ui/api/comments.ts                          | Typed HTTP calls                               |
| ui/hooks/use-comments.ts                    | Loading, pagination, errors, operation state   |
| ui/hooks/use-comment-composer.ts            | Drafts, editing, submission                    |
| ui/components                               | Panel, composer, individual comment            |

Request flow: route → schemas → per-request CommentsService → useStorage(context, entries) → presenter. The service checks target-record read access and authorship before storage. Types derive from the declaration, without a separate database model. UI uses shared Kit Button/Textarea and named createComment/updateComment/deleteComment calls.

The root asmblyr.plugins enables the package. Pnpm dev builds Kit/plugins; Core installs tables/applies new plugin migrations at startup. Core upgrades need pnpm db:migrate for its registries. Production builds first, then starts services.

## API

The public admin domain adds /api; direct Core also supports unprefixed paths.

| Method | Core path                          | Operation                      |
| ------ | ---------------------------------- | ------------------------------ |
| GET    | /comments/:collection/:item?page=1 | Latest first, pages of 30      |
| POST   | /comments/:collection/:item        | Create with { "body": "text" } |
| PATCH  | /comments/:collection/:item/:id    | Edit own text                  |
| DELETE | /comments/:collection/:item/:id    | Delete own comment             |

Every endpoint requires a human/session or service token and target-record read access, including row conditions. Readers need no record-update grant to comment. Only authors edit/delete through these endpoints; separate superuser moderation is unsupported. Every request rechecks access, so policy revocation applies next request. System/plugin collection discussions are unsupported.

Author/name come from context; the name is snapshotted on submission, without exposing email. Historical unknown authors remain NULL. Text is 1–10000 trimmed characters; HTML never executes. Extra body keys are rejected. Pagination ties use ID; the index covers record address, date, and ID.

Items.get authorizes the target; storage accesses only the plugin's collection with Core validation/timestamps/history. Participants need no plugin_comments_entries grants. Direct /items remains an ordinary-grant administrative path that bypasses specialized API rules if explicitly granted.

Comments save immediately, independently of record drafts. Text survives tab switches; closing unsent text requires confirmation. Editing, delete confirmation, retry, and pagination are supported. Load/save errors are separate. Editing another comment protects the current draft; deleting another does not block it. IsOwn is distinct from canEdit/canDelete.

New unsaved records have no discussions. Replies, mentions, attachments, realtime, email, and push are unsupported. Follow and the first submitted comment subscribe to others' comments; explicit unfollow is not automatically reversed. The separate bell opens unread comments and requires approved notifications capability.

Enabled hooks delete discussions in the same transaction as Core record/collection deletion; failures roll back. Saving holds the target record against concurrent deletion and normalizes UUID from the stored row. Direct SQL, database cascades, and deletions while disabled emit no hooks. There is no background orphan cleanup; clean separately before reusing their addresses. Startup does not silently delete old data.

Settings → Plugins → Comments exposes allowNewComments and maxLength (100–10000), applying to subsequent requests. Disabling creation preserves reading/editing/deleting your own comments. Core checks limits on create/update; UI receives canCreate/maxLength.

Manifest/project approvals cover identity.profile, items.read, collections.manage, storage.own, hooks.items, hooks.collections, settings, and notifications. Items.write is unnecessary.

See [plugin lifecycle](../kit/LIFECYCLE.md).
