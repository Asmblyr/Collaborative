# Contextual assistant — schema and data tools

Implemented 2026-09-30; extended 2026-10-01 with [internal MCP](internal-mcp.md).
Core owns tool execution; UI publishes a page snapshot. The model uses function
calling through the configured OpenAI-compatible client; the assistant executes
shared tools through an in-memory MCP client/server. No external MCP endpoint
is exposed and the model receives no SQL, HTTP or MCP credentials.

Collection names, descriptions and opt-out enforcement were added on 2026-10-01:
see [Collection metadata and MCP exposure](collection-metadata.md).

## User flow

Result cards for other collections and live progress/Stop were added on
2026-10-02: [Assistant results](assistant-results.md).
The assistant also supports [aggregates and grouping](assistant-aggregates.md)
with full-selection metrics and cards that open a group's source records.

1. The chat shows the current collection/page and workspace. The context switch
   disables attachment of page state to subsequent messages.
2. On send, UI captures the page, workspace ID, collection, pagination, sorting,
   search, current filter, selected **count** and whether an editor is open.
   Row values, row IDs, filenames and unsaved form values are not attached.
   Search/filter operands are part of the snapshot and reach the provider.
3. Core parses an explicit allowlist and resolves workspace and schema itself.
   The browser supplies no permission claims. Workspace is navigation scope;
   collection/field grants remain the authorization boundary.
4. The model can discover readable MCP-enabled collections, describe them,
   read/search/count permitted records on demand, and propose a validated filter
   for the current table. Requested record values
   are sent to the configured AI provider; the UI explains this by the composer.
   UI displays canonical conditions, including relation paths, in a typed card.
5. “Применить фильтр” revalidates against current Core schema/access and stable
   collection UUID, then sets the ordinary table filter and resets to page 1.
   It **replaces** existing filters and **preserves** search and sorting. It does
   not read records for the model or mutate database data.

The action is available only on the original collection and workspace, with no
record editor open. Navigation during revalidation invalidates the action. A
collection recreated with the same name has a different ID and is rejected.
The action carries its own target; navigating while a response is generated
does not retarget it. Failed-request retry reuses the exact sent snapshot,
history and settings. Visible history stays in the browser, but only messages
from the same page/collection/workspace context mode are sent as history.

## Core tools

| Tool                  | Contract                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_collections`    | `{ q, page, limit }`. Readable MCP-enabled collection names, display names and descriptions. Up to 20 results, `hasMore`; available on non-item pages too.                                                                   |
| `describe_collection` | `{ collection }`. Returns readable fields, permitted M2O references and filterable paths, one relation level, up to 100 fields/200 paths with a `partial` indicator. No defaults or arbitrary presentation metadata.         |
| `propose_filter`      | `{ filter: string }`, JSON text in the existing item-filter wire format. Requires describe first. Core uses `parseItemFilters` and `plainFilter`. The last valid proposal is returned as a structured action.                |
| `search_items`        | `{ collection, q, filter, fields, limit, page, sort, direction }`. Requires describe for that collection first. 1–20 rows, pages 1–50, 1–12 explicitly requested physical fields plus PK. Returns `hasMore`; no count query. |
| `read_item`           | `{ collection, id, fields }`. By primary key, independent of table filters. Same permitted projection and previews. Missing record returns `found:false`.                                                                    |
| `count_items`         | `{ collection, q, filter }`. Exact count as a decimal string, no record projection or row fetch. Requires describe first.                                                                                                    |
| `validate_filter`     | `{ collection, filter }`. Validate without creating a UI proposal. Requires describe first.                                                                                                                                  |

In the assistant, `collection:null` selects the current page collection. Other
pages require an explicit name. For search/count in the current collection,
`q:null` and `filter:null` inherit the sent table conditions;
empty strings clear the corresponding condition for the tool query. Explicit
conditions replace, rather than append to, that part of the snapshot. Search
sort/direction use the same null inheritance; pagination is explicit. None of
these reads modify table state. In another collection null uses no search/filter
and sorting by that collection's primary key ascending. Read by ID deliberately
ignores view conditions.

All three tools reuse ordinary item parsers, search configuration (including
one relation level), predicates and collection/field grants. `items/read-query.ts`
is shared with `listItems`. Explicit collection selection is checked against
current permissions and MCP exposure. There is no raw SQL or new permission
semantics. Results do not expand relations, fetch file contents
or include hidden fields. Schema exposes `readableValue` to distinguish physical
values from virtual to-many fields, which remain available as filter paths.

Every tool invocation reloads authorization from the original bearer token:
disabled users, revoked sessions and changed grants are checked again. Reads
also reload schema and verify the original collection UUID. A read-only database
transaction holds an ACCESS SHARE table lock and sets a local 5-second statement
timeout (including lock waits). Cancellation is checked between queries and
before returning values; a query already executing finishes or times out within
that bound. Revocation cannot retract results already sent to the provider.

Values use explicit `encoding:"text"`; null remains null and bigint/numeric
precision is preserved. PostgreSQL clips each cell to 2001 characters before
transfer to Core. Preview values are capped at 2000 characters, further shared
across a 18000-character value budget. Each item contains `values` and
`truncatedFields`; PKs remain intact. Rows are never silently dropped to fit
that budget. SQL sorts by qualified original columns, not textual preview aliases.
The existing total 60000-character tool-output budget still applies. These tools
are previews, not an export or document retrieval pipeline. Counts use a separate
aggregate and may time out on large unindexed queries instead of inventing totals.

Record content is untrusted data in runtime instructions. It cannot grant tools,
override permissions or authorize writes. No prompts, answers or record values
are persisted in the request journal; requested data reaches the configured
provider and its retention policy applies. Context off means no data tools.

M2O, O2M and M2M paths use the same permission checks as ordinary filters,
including target fields and the reverse foreign key. Hidden/unsupported paths
are absent. Parser errors returned to the model are generic, with no SQL or
database details. The model's text cannot create an action: only a successful
Core tool result can. No arbitrary Adaptive Card execution is enabled.

`POST /assistant/messages` accepts optional `context` (or `null`). Without a
context, it retains plain chat behavior and supplies no tools. Non-collection
pages attach only page/workspace information. Response adds `proposals` only
for contextual requests; provider internals and reasoning remain server-side.
Non-collection pages expose the shared MCP tools with explicit collection names;
UI filter proposals remain specific to item pages.

`POST /assistant/filter/validate` accepts `{ context, collectionId, filter }`.
It uses the ordinary authenticated human access boundary and returns canonical
`{ data: { filter } }`. Validation itself neither invokes AI nor changes a view
or data. The UI applies the returned filter through its normal navigation.

## Execution and telemetry

- No fixed provider-call or tool-call count budget; sequential execution,
  12000-character argument limit and 60000-character total tool-result limit.
- The configured timeout (maximum 120 seconds) covers the whole provider loop.
  No automatic paid retries. Existing concurrency and request rate limits apply
  to the whole turn. Each call retains the configured output-token limit.
- Responses uses `store: false`, function-call outputs by `call_id`, and retains
  reasoning output/encrypted content for the current loop. Chat Completions
  preserves tool call IDs and Z.ai `reasoning_content` in memory for continuation.
- Every model call is journaled before sending. `turn_id` groups one user message;
  `call_index` identifies calls from 1 onward. UI telemetry shows both. Token sums include
  repeated context because those are actual input tokens on each call.
- `asmblyr_assistant_turns` stores whole-message duration, model/tool call counts,
  tool errors, status and known usage with sample counts. Chat displays this summary
  outside the answer text; telemetry includes it alongside individual calls.
- Migration `20260930090000_assistant_turns.cjs` preserves existing rows (each is
  backfilled as its own turn). Rollback refuses to discard multi-call grouping.
  No prompts, schemas, filters, answers or reasoning are added to the journal.

## Verification

- Assistant tests cover both provider formats, reasoning continuation, call IDs,
  malformed arguments, loop limits, context allowlist and plain-chat compatibility.
  Provider calls in tests use a fake transport.
- PostgreSQL integration covers hidden source/target fields, M2O/M2M paths,
  reverse-FK permissions, stale collection IDs, revoked grants, invalid filters
  and three separately journaled calls with one turn ID.
- UI tests cover target binding, workspace changes, context scope and open
  editors. Typecheck and lint cover both apps.
- Data tests cover search/filter parity with the items API, hidden source and
  target fields, projection/sort rejection, inherited/cleared conditions,
  pagination, null/large text/JSON previews, exact text/UUID/bigint IDs, count-only
  SQL, DDL timeout recovery, cancellation and recreated collection rejection.
- HTTP/provider integration exercises all three data tools with a real restricted
  user, permission changes and disabling the user mid-turn. All paid attempts
  remain separately journaled without persisting content. Transport is mocked.
- Live GLM browser verification with a temporary synthetic collection and a
  restricted human user returned both active records, exact count 2, and the
  requested detail from a third record by ID. The fixture and its temporary
  read policy were removed afterwards. Screenshot: `artifacts/assistant-data-tools.jpg`.
- Real GLM browser request on `test_col` described schema and proposed a
  relation filter on `asdasd.title1` without reading row values. The filter was
  applied to the table. Moving to `example` disabled the original proposal's
  button; returning restored it. Screenshot: `artifacts/assistant-context.png`.

## Next stages

1. User-selected record context and explicit related-record navigation.
2. More typed suggestions: form drafts, sorting and view configuration.
3. Explicit write proposals with review and ordinary audited Core operations.
4. External MCP adapter when required by another client. MCP transport alone
   does not give the assistant page awareness or permission enforcement.

Sources: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling),
[Z.ai Chat Completions](https://docs.z.ai/api-reference/llm/chat-completion).
