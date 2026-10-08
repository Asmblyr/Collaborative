<a id="ассистент-и-внутреннии-mcp"></a>

# Assistant and internal MCP

See [assistant architecture](../development/assistant-architecture.md) for the request, tool, and model-handler pipeline.

The assistant is optional. Core connects to an OpenAI-compatible provider and keeps the key on the server. The UI sends current-page context and streams responses. Users choose whether to navigate to suggested pages.

Tools inspect accessible schema, search/read data, build filters and selections, prepare forms, and call explicitly declared plugin model handlers. Human labels come from display metadata; API calls use technical names.

Ordinary searches are instructed to return relevant records and a full-selection button. Counts, rankings, and extra dictionaries are requested when the question needs them; deeper analysis can follow in another message. This is a model instruction, not a provider-latency guarantee.

<a id="границы"></a>

## Boundaries

Chat requires a human who is a superuser, has at least one read/create/update data grant, or has an active personal Google connection. The assistant settings permission grants configuration access, not chat or data access.

Internal MCP is the assistant's shared tool contract. There is no public external MCP endpoint yet. Every operation uses the user's permissions and collection MCP enablement, including for superusers. Never expose raw SQL or privileged storage to the model.

Plugin developers wrap H3 handlers in `defineModelContext<Input>` with an annotation. HTTP and MCP use the same handler and checks. Entry AccessGate does not replace permissions on affected data. Read-only mode must prevent writes in available tools.

<a id="настроики-и-журнал"></a>

## Settings and telemetry

Settings include instructions, model, and telemetry: user, time, requested/actual model, tool calls, input/output tokens, duration, and outcome. Missing provider usage remains unknown rather than becoming zero.

Response summaries include `toolTrace`: up to 32 calls with sequence, declared tool name, duration, result, and fixed error code. Arguments, result contents, and exception text are excluded. Older responses may lack this field. Token counts sum model calls within a response; they are not the size of one context.

The default total response timeout is 180 seconds, including history compaction and tool continuations. `OPENAI_API_TIMEOUT_MS` accepts 1000–300000 ms and preserves explicit values. Each response allows at most eight model calls. User cancellation interrupts generation and tools. The public proxy permits 310 seconds so it does not cut off Core's maximum timeout.

Tool errors provide safe `code` and `hint`, such as SCHEMA_REQUIRED before describing a collection or INVALID_FILTER for malformed filters. An identical failed call is blocked from executing again within the response, prompting a final answer. Corrected arguments can be retried while steps remain.

Filter error `reason` distinguishes JSON structure, path, operator, value type, quantifier, and limit errors. Hints explain corrections without revealing rejected values. Filters are JSON strings with logic/children groups. Empty string clears conditions; actual JSON null inherits context; the string "null" is invalid.

Searching for another client should replace the open table's client condition. This is a model instruction; Core still enforces all filters and permissions. Meaningful conditions such as “active” must persist in search, counts, and cards through a configured term or explicit criterion. Ambiguous terms require clarification.

Tool search `q="null"` is rejected as a mistaken empty value. Use JSON null to inherit or an empty string to clear. Literal text can be searched with `q="NULL"` or a text-filter value. This restriction is internal to assistant tools; HTTP/SDK search is unchanged. Inherited table search is preserved in full.

Search `order` (relevance/field) is inherited and retained in selection cards, so opening them reproduces the validated order. Explicit field sorting selects field order; relevance order uses the field only for ties.

When a completed response contains only present_selection or present_plugin_result calls, Core validates/creates cards and displays its text without another model call. Invalid cards, empty text, or additional tools require normal continuation. Write confirmation and user-controlled navigation are unchanged.

describe_collection describes M2O, O2M, and M2M. For accessible to-many relations, relation.relatedRead gives the target collection, filter field, operator, quantifier, and source key. Related records are read separately; alias fields cannot appear in fields. Hints respect field reads, MCP enablement, and relationship-filter limitations under row rules.

The shared glossary maps user terminology to data meaning. Collection-specific mappings currently require a superuser.

<a id="сессии-и-история"></a>

## Sessions and history

Work progress is separate from the answer: elapsed time, compact gray action statuses, and public assistant notes. After completion it collapses, retaining steps and statistics. The final answer contains only the model's final message, including tables, selection cards, and important caveats. Internal reasoning, tool arguments, and raw results are not exposed in progress.

A compact Copy button appears after completion or stopping. It copies original Markdown, including tables and code, excluding progress, metrics, and separate action cards. Success is acknowledged; denied clipboard access prompts manual selection/copying. Header icons have tooltips. New session starts a separate conversation while preserving the previous conversation and draft.

Wide tables scroll horizontally inside narrow responses without splitting numbers or identifiers. The table area is keyboard accessible, and code blocks scroll independently. Short panels use a compact composer and spacing, preserving room for messages; long drafts scroll inside the input.

The API returns separate `activity`: up to 64 status/note entries, 8000 characters each and 64000 total. New messages save activity separately from content and restore it as expandable history. Continuation and compaction use completed messages only, excluding activity. Older stored answers are unchanged.

NDJSON includes activity events. A text-delta with provisional=true belongs to the unfinished step and appears in progress, not yet the final answer. On step completion, Core keeps it as a public note or sends final text with reset=true, replacing current answer text. Stopping preserves public notes separately and confirmed answer text in content.

An empty conversation shows a welcome card with search and structure actions, or filter/field explanations on collection pages. Without page context, it suggests general data-design questions. Database and Google tools remain available if data access is separately enabled. Clicking a suggestion fills an editable prompt; the user still sends it. The card also opens personal Google Drive/Sheets connections and disappears once conversation begins.

Saved records offer Ask about this record. The assistant opens inside the editor, including nested cards and imported materialized views. Collapsing it keeps the record card and draft open. Context shows collection and record ID; closing the card restores page context.

The composer shows context for the next question. A change from the previous question displays a compact history-context hint. Context transitions have separators in the conversation and persist in restored history. Help explains isolation, compaction, and working without page context. Search/filter changes within one table do not create a separate history. Navigation during generation leaves the submitted context unchanged; the new location applies to the next question.

A record snapshot sends only its saved identifier. Before contacting the model, Core checks MCP enablement and read access to that row. Tools fetch field values with current user permissions. Unsaved form values and new draft records are excluded. Table conditions are not inherited by record context, and Apply table filter is unavailable inside a record card.

Record context is `{ page: "items", workspaceId: null, collection: "articles", record: { id: "1" } }`. Record accepts only a string ID up to 255 characters, additionally validated against primary-key type. Record and table are mutually exclusive. A collection disabled in MCP omits record context and denies its data/schema tools. Existing table context remains compatible.

Page context and data access have separate controls. The composer switch enables page, collection, record, and table-condition information. Data and connections in Assistant connections enables database, personal Google, and plugin tools for future questions. Disabling it neither deletes accounts nor stops an already submitted request. User grants, MCP enablement, and Google write confirmation still apply.

The optional /assistant/messages parameter `dataAccess: { enabled: true, workspaceId: null }` enables tools with context:null, without page information. The model must explicitly find/select a collection; search/filter conditions are not inherited and suggesting a filter for the open table is unavailable. Enabled:false disables every tool regardless of context. With context present, workspaceId must match. This binds conversation context; it adds neither permissions nor a collection-catalog restriction.

Clients omitting dataAccess preserve previous behavior: no context means no tools. Invalid parameters are rejected rather than enabling access.

Working history and summaries are partitioned by access mode and workspace even without page context. Turning access off keeps visible messages but excludes the data-enabled mode's messages/summaries from new responses. Returning to that mode resumes its history. Retrying keeps the original page snapshot and never broadens access: if the user disabled tools after failure, retry keeps them disabled.

Widget conversations are stored in PostgreSQL and owned by the current user. Session history opens previous conversations; reload restores the latest session. New session creates an empty context and retains earlier history. Sessions can be deleted and older messages loaded. Other users' history is inaccessible, including to superusers.

Unsent text stays separately per session in the open admin's memory. New conversations start empty; previous drafts remain in history with a Draft marker and a Return to draft hint. Reopening restores input, and loading older messages does not change it. Failed session creation/opening preserves the current text. Input written before the first session is attached to it. Successful session deletion also removes its draft.

Drafts are never sent to the API/model or browser storage. Collapsing preserves them; reloading or leaving the admin clears them. PostgreSQL history excludes unsent input.

Stored history includes message text, public progress, page-context association, completion/stop outcome, and metrics. It excludes raw page snapshots, tool results, connection tokens, and internal reasoning. Text stays as sent by the user/assistant. Interactive filter, form, and write-confirmation cards work only in the current response and are not reactivated from history. Ask again for a new action.

Before model calls, Core collects completed message pairs for the current context. Exceeding 24000 characters, 25 messages, or 50000 serialized bytes triggers compaction of older history using the same model without tools. Summaries are capped at 4000 characters, preserving recent messages and the current question. Full conversation history remains in the database.

Each page/record context has its own summary, which is not transferred to a new session. The visible transcript is shared, but the model receives completed messages only from the current context. Conversation content grants no authorization. Compaction counts toward telemetry and the eight-call limit.

POST /assistant/messages supports persisted conversationId, messageId, content, and optional settings/context. Repeating a completed messageId returns saved text without another model call; changing its body is forbidden. The legacy messages format remains compatible but does not persist conversation. Session API: GET/POST /assistant/conversations and GET/DELETE /assistant/conversations/:id, with before pagination.

Only one request runs per session. Client disconnect stops generation; received text is saved when handling cancellation. After a process crash, incomplete responses become interrupted after eleven minutes. Compaction and answering share one configured timeout. Background generation and stream resumption after reload are unsupported.

Deleting a user deletes personal conversations. When explicitly configured, HISTORY_RETENTION_DAYS removes inactive sessions by last-message time.

PostgreSQL shares limits across replicas: defaults are 100 requests per user per UTC day and two concurrent requests, controlled by ASSISTANT_DAILY_REQUESTS and ASSISTANT_CONCURRENT_REQUESTS. Each request permits eight model calls, 100000 serialized context bytes before each call, and the configured output-token limit.

The last available call is reserved for a final answer without tools, counting compaction. If steps run out, the model should explain missing information. Core never executes a tool returned on that final step. These are volume/count limits, not a monetary provider budget. History is retained by default; age cleanup requires HISTORY_RETENTION_DAYS.

Confirmed assistant disablement hides the closed widget. An already open panel preserves conversation/input and shows that it is disabled. Network errors, timeouts, or invalid status responses keep the panel visible with Retry. Retry checks the connection without sending a model message. New questions stay disabled until a successful check, while input remains editable. Technical failures preserve the last known configuration and user settings.

401 and 403 have distinct expired-session/access-denied messages. Initially confirmed lack of access hides the closed widget. Manual checks and focus/settings changes cancel prior checks; stale responses cannot replace newer results. Status checks time out after eight seconds.

Record discussions remain in the Comments plugin. [Notifications](./notifications.md) use a separate header bell and work independently of AI.

Context and tool-result data go to the configured provider. Provider choice, transfer scope, and contractual requirements are operator decisions. Record text and plugin results may contain prompt injection; model output is never an authorization boundary.

## Google Workspace

[Personal Google Drive and Sheets connections](./google-workspace.md) add on-demand reads and confirmed write proposals. An active connection also permits chat without data grants while preserving Core access limits.

Write cards distinguish completion, rejection, pre-write failure, and unknown outcome. Results can be reopened and refreshed through a read-only status request without repeating confirmation. Links open the Google file/spreadsheet when available. Viewing remains owner- and lifetime-bound; see [Google Workspace](./google-workspace.md).

Cancellation works through any Core replica: PostgreSQL stores the request, and the active process checks every 500 ms. Process restart interrupts the stream; seamless generation continuation is unsupported. Prepared plugin forms are stored in PostgreSQL for twenty minutes and check ownership when opened.
