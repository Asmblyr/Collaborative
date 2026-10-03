# Internal MCP for the assistant

Implemented 2026-10-01. MCP is an internal Core module. The assistant connects
using the official `@modelcontextprotocol/sdk` and `InMemoryTransport`.
Initialization, `tools/list` and `tools/call` use MCP; no HTTP, stdio or other
externally reachable MCP endpoint is registered. No additional deployment or
environment configuration is required.

## Boundaries

- `src/tools/` owns reusable tool contracts, authorized collection discovery,
  schema descriptions, bounded data reads and filter validation. It has no
  dependency on assistant prompts, providers, UI state or MCP transport.
- `src/mcp/internal-client.ts` connects a client/server pair inside Core and
  adapts these operations to MCP. Tools are marked read-only. Annotations are
  descriptive; the actual registered operations and read-only item transactions
  enforce the boundary.
- `src/assistant/context-tools.ts` binds page defaults, adapts the MCP schemas
  for model function calling and creates the UI-only `propose_filter` action.
- `AssistantService` closes the connection in `finally` after success, failure
  or cancellation. Sessions and described collection identities are per turn,
  never shared between users or conversations.

## Identity and permissions

The HTTP assistant route authenticates the current user. Core binds that identity
to a tool session and retains a server-side callback that reauthenticates the
original bearer token. Every `tools/list` and `tools/call` checks current access;
changing the principal during the same tool session is rejected. Token expiry,
session revocation, disabled users and changed permissions take effect on the
next invocation. Tokens and actor identity are never model-supplied arguments.

Effective access is the intersection of user collection/field permissions,
collection MCP exposure and the registered read-only operations. Even superusers
cannot read a collection disabled for MCP. Service principals cannot open this
assistant-only integration. Existing field and relation query guards are reused;
there is no arbitrary SQL or generic HTTP tool.

`hidden` controls navigation only. Workspaces remain navigation context. Neither
is a permission boundary. Discovery can include a hidden collection when it is
readable and MCP-enabled. Enabling MCP does not grant a user additional rights.
Row-level permission filters remain a future feature; this module does not
introduce an independent implementation of them.

## Initial tools

| Tool                  | Behavior                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_collections`    | Names, display names and descriptions of readable, MCP-enabled collections. Optional name search, pages 1–50, 1–20 results and `hasMore`; no records or full catalog metadata.                       |
| `describe_collection` | Readable fields, types, permitted one-hop filter paths and readable M2O target/key references. At most 100 fields and 200 paths, with `partial`.                                                     |
| `search_items`        | Ordinary item search/filter semantics, explicit projection, 1–20 rows, pages 1–50 and `hasMore`.                                                                                                     |
| `read_item`           | One record by primary key, independently of table filters.                                                                                                                                           |
| `count_items`         | Exact count as a decimal string; no record values.                                                                                                                                                   |
| `validate_filter`     | Canonical permitted filter and stable collection identity; does not apply a UI action.                                                                                                               |
| `aggregate_items`     | Count, distinct count, sum, average, minimum and maximum over the full matching selection; optional scalar grouping, native sorting and group pagination. See [aggregates](assistant-aggregates.md). |

The shared MCP contracts require an explicit collection name. Reads and filter
validation require `describe_collection` for that collection first. A collection
recreated under the same name is rejected within an existing turn. Data tools
retain five-second transaction timeouts, read-only transactions, bounded text
previews and precise bigint/numeric representations.

The assistant also offers `propose_filter` on item pages. It calls MCP filter
validation and produces the existing Apply card, targeted at the original
collection UUID and workspace. Applying it revalidates current schema and rights.
Validation for another collection does not create an action for the open table.

`present_selection` is another assistant-only presentation tool. It refers to a
successful search/count or selectable aggregate group by its server-generated result ID and creates an
“Открыть записи” card for that selection, including other collections. See
[result cards and cancellation](assistant-results.md).

## Page context and assistant use

User-facing context labels and filter cards use collection display names. Core
resolves `displayName` from the authorized collection metadata for page snapshots,
data results, filter proposals and readable M2O references. The assistant is
instructed to use display names in prose; technical names remain tool arguments
and URL identifiers. Collections without a display name fall back to their
technical name. Renaming a display label does not retarget actions or permissions.

With context enabled, the assistant can discover and read permitted collections
from non-item pages as well. On an item page, `collection: null` means the current
collection. Existing omitted-collection calls are normalized for compatibility.
For that collection, null search/filter/sort/direction inherit the sent page
snapshot. For another collection, null means no search/filter and its own primary
key ascending. Page filters never implicitly carry over to another collection.

The context-off switch retains plain chat with no tools. An explicitly
MCP-disabled current collection also retains its existing no-tools behavior and
does not expose its name/query/schema to the provider.

There is no fixed provider-call or tool-call count budget. A 60,000-character
total tool-result budget and the configured turn timeout remain. Telemetry
journals each provider call and whole-message metrics (including tool attempts,
failures and partial usage) without storing tool data, prompts or replies. Chat
shows a factual usage footer. Data requested by tools reaches the configured AI
provider.

Example requests:

- «Какие коллекции мне доступны?»
- «Найди коллекцию площадок и покажи пять записей с названиями»
- «Какие поля и связи есть у этой коллекции?»
- «Сколько записей соответствует текущему фильтру?»

## Verification

Regression coverage includes real PostgreSQL permissions and session revocation
through the in-memory MCP transport, hidden versus disabled collections,
forbidden fields and actor arguments, M2O target reads, independent query defaults,
no public `/mcp`, provider-to-MCP execution from a non-item page, telemetry,
context-off behavior and connection cleanup after provider failure/cancellation.
Provider tests use an injected transport and do not make billable AI requests.

Verified: 137 Core tests and 42 UI tests passed; Core/UI typechecks, Core lint,
lint of the changed UI components, Core build and formatting checks passed.
Local Core `/health` and UI returned 200; `/mcp` returned 404.
