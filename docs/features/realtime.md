# Real-time collaboration

Live subscriptions operate on accessible collections and records. Tables refresh after saved changes; record forms show participants, connection state, and active field editing. Record data is fetched over HTTP. Events contain identifiers, permitted field names, and history event IDs, and preserve unsaved edits.

## Presence

An SSE subscription creates a 30-second presence lease. It is renewed while active and removed on close. Core checks row read access on connection and events. Multiple windows of the same human are combined into one participant with name, avatar, and window count. A crashed window disappears when its lease expires, within 30 seconds. The legacy HTTP presence API remains available.

Each renewal sends the current participant list, also removing windows that expired without a leave event. Admin components share one stream per scope. A new subscriber immediately receives connection state and the latest presence snapshot. Disconnection clears that snapshot until fresh data arrives after reconnection.

<a id="live-updates-и-разрешения"></a>

## Live updates and permissions

Core emits `record.created`, `record.updated`, and `record.deleted` inside the write transaction. PostgreSQL delivers notifications after commit and across Core instances.

Record subscriptions use the same collection and row read rules as HTTP `/items`. Field names are filtered by actual visibility; sensitive fields are excluded. A collection subscription receives only `collection.changed`, and only for a readable changed row. With conditional permissions, deletion is not announced because the deleted row can no longer be checked.

Revoked permissions are detected on the next event or lease renewal, within 20 seconds, and close the stream.

<a id="field-locks-и-конфликты"></a>

## Field locks and conflicts

Focusing an editable field acquires a 30-second lease. Core checks read and update permissions for the field and row. A second session receives `409 FIELD_LOCKED`; other fields remain editable. Leaving the field releases its lease; network loss lets it expire. The client renews an active field every 10 seconds.

Locks communicate editing activity but do not guarantee a successful save. Atomic draft commits still compare `expectedValues` for changed fields and return `409 ITEM_CHANGED` when another edit touches the same field. The editor retains the draft and offers the existing value choices. Ordinary `PATCH` without a precondition keeps its existing contract.

A clean form accepts refreshed data only if it is still clean when the HTTP response arrives. The `expectedValues` baseline updates with the fields. If typing started during the request, the response does not replace the form.

<a id="reconnect-и-sdk"></a>

## Reconnection and SDK

`client.realtime.connect()` returns a typed connection. `subscribe(scope, callback)` returns an unsubscribe function. `on(type, callback)` and `onState(callback)` return listener cleanup functions. `locks.acquire`, `refresh`, and `release` accept `{ collection, recordId, field, clientId }`.

The SDK reconnects with backoff and jitter, registers presence again, and emits `collection.changed` so clients reread data. Both subscription callbacks and global `on("collection.changed")` handlers receive this event. Duplicate IDs within one stream are ignored. Unsubscribing and `close()` release the connection.

The browser admin opens `/api/realtime/stream` directly in Core using its HttpOnly cookie. A direct Core client needs a valid human Bearer token.

<a id="границы"></a>

## Boundaries

Events cover Core operations, including Kit writes. Direct SQL writes do not emit events. Comments and permission changes do not yet have dedicated live events. SSE does not retain an event queue; reconnecting clients fetch current data.

Presence and locks do not support service keys. The envelope's workspace is `null`: workspaces group collections and do not isolate data.
