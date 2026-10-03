# Assistant result cards, progress and cancellation

Implemented 2026-10-02.

## Open records

Successful `search_items` and `count_items` calls expose a server-generated
`resultId` within the current assistant turn. `present_selection({ resultId })`
selects one of these results for a card. The model cannot supply a URL, count,
collection name or replacement conditions to this presentation tool.

The snapshot includes the stable collection UUID, display name, exact canonical
filter (including resolved business terms), search and sorting. Count is present
only for a count result; a search page is never described as a total.
Repeated presentation of the same result is deduplicated.

Selectable groups returned by `aggregate_items` also get result IDs. Their cards
retain the base query and add the exact group keys; see
[aggregates and grouping](assistant-aggregates.md).

`POST /assistant/selection/validate` rechecks the signed-in human's current
read/field grants, MCP exposure, collection identity and query schema. Core
returns a canonical query. The UI builds a local `/items/:collection` URL with
page 1 and explicit conditions. This prevents a saved default view or published
state filter from silently changing the selection. The number on a card is a
snapshot; the table loads current data when opened.

Cards can open a different collection from any page. The active workspace stays
unchanged: workspace membership is navigation organization, not access control.
An open record editor disables the button; programmatic navigation also uses
the shared unsaved-editor guard. These cards complement the existing
current-page-only `propose_filter` action.

## Transport

`POST /assistant/messages` retains its JSON response for ordinary API clients.
With `Accept: application/x-ndjson` it sends newline-delimited events:

- `started`: an unpredictable request ID bound to the authenticated user.
- `progress`: controlled operation label and model/tool invocation counters.
- `answer`: the completed reply, cards and whole-turn usage summary.
- `error`: a safe error code/message and usage summary when a turn was started.

Progress comes from actual execution boundaries. No raw tool arguments,
record contents, provider errors or model reasoning appear in progress events.
The assistant text itself is delivered when complete.

The Next proxy forwards the response body without buffering, preserving session
renewal, CSRF origin checks, request timeouts and disconnect cancellation.
The browser parser handles split UTF-8 and JSON frames. Truncated responses
cannot be treated as a completed answer. UI request identity guards ignore late
events from an old conversation.

## Stop

`POST /assistant/messages/:id/cancel` accepts only the request owner's current
human session. It aborts Core's controller, the provider SDK request and the
internal MCP operation signal. The response stream remains open to deliver the
cancelled status and known usage. Disconnects also abort Core. If cancellation
delivery fails, the browser closes the original request after a bounded wait.

No further tools/model calls start after cancellation. An already executing
PostgreSQL statement can finish or hit its existing five-second timeout; the
signal is checked between queries and before returning data. Aborting the HTTP
request does not guarantee that the external provider stops billing immediately.
Unknown provider usage remains unknown.

The cancelled exchange remains visible but is omitted as a pair from subsequent
model history. Completion can win a race with Stop; in that case the completed
answer is shown. Restart/unmount discard old UI events and abort pending work.

The active request registry is process-local, as is the existing concurrency
guard. Multiple Core replicas require routing a cancellation to the owning
replica or introducing a shared cancellation channel before deployment.

## Verification

- Isolated PostgreSQL integration: real query/term/search parity with the items
  API, fabricated result IDs, duplicate cards, stale collection UUID, denied
  fields and disabled MCP on click.
- HTTP streaming integration: actual provider transport cancellation, owner
  binding, final cancelled telemetry, completion events and released user slot.
- UI tests: byte-split stream decoding, truncated frames, Stop before started,
  exact selection URLs and exclusion of cancelled exchanges from model history.
- Core/UI TypeScript and ESLint.

Live browser verification: GLM returned 48 published Ozon categories for the exact
Nestle client; the card opened `shop_categories` from the collections page and
the table showed `1–25 из 48`. The turn used 10 model calls, 14 tool calls,
75,648 input and 1,830 output tokens in 54.3 seconds. A subsequent request was
stopped from the UI during the second model call; its final summary retained
one completed tool call and partial token usage.

Screenshots: selection and table (локальный артефакт, не публикуется),
progress (локальный артефакт, не публикуется),
stopped request (локальный артефакт, не публикуется).
