<a id="обсуждения-и-уведомления"></a>

# Discussions and notifications

The notification bell is separate from the assistant. Disabling AI does not disable notifications.

<a id="подписка-на-запись"></a>

## Following a discussion

Use Follow in a record's Discussion tab. Posting your first comment automatically follows that discussion. Explicitly unfollowing it prevents later comments of your own from enabling following again.

A new comment notifies other followers who can currently read the record. Your own comments do not notify you. Editing a comment updates its notification excerpt; deleting it removes associated notifications. Email, push, and notifications for ordinary field changes are not implemented.

<a id="входящие"></a>

## Inbox behavior

The bell shows the author, excerpt, collection, record, and time. Clicking a notification opens the record, finds the comment even on an older page, highlights it, and marks the notification as read. If the comment no longer exists, the UI explains this.

Opening the list alone does not mark notifications as read. Mark all as read uses the list's snapshot time; newer arrivals remain unread. Read state is stored in PostgreSQL and shared across devices.

The UI refreshes every 30 seconds while visible, on window focus, and when opening the bell. Navigation respects the unsaved-changes guard.

The inbox retains the latest 200 notifications per user and initially displays 50, with Load more. The unread count includes accessible notifications within this window. Row permissions are checked again when reading. Disabling the plugin hides its notifications but keeps the data. Deleting a record removes its subscriptions and notifications. Collections are tracked by stable ID, so a new collection with the same name does not inherit them.

<a id="api-и-sdk"></a>

## API and SDK

- `GET /notifications?limit=50` returns `{ data, unread, total, readBefore }`.
- `POST /notifications/:id/read` returns 204; another user's or unavailable notification returns 404.
- `POST /notifications/read-all` with `{ before: readBefore }` returns 204.

An active human account is required. Service accounts may comment with the usual grants but have no human inbox or subscriptions. The SDK exposes list, read, and readAll operations. The admin calls Core through `/api` using an HttpOnly session.

<a id="контракт-плагина"></a>

## Plugin contract

The `notifications` capability requires administrator approval. In a normal HTTP handler, `useAsmblyr` provides following, follow, publish, update, and remove operations. Core derives the plugin namespace and author from the caller and selects recipients through its permission checks. Model handlers do not receive privileged notification operations.

Publish inside `withRecord` to use the same transaction as the comment. This capability does not send external messages.

`RecordPanelProps` supports optional `active` and `targetId`. Links use `?panel=plugin:namespace:panel-id&target=entity-id`; the host accepts only a registered panel. The plugin checks access and renders the target. The host remains independent of comment-specific behavior.
