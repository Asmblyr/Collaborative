# Optional AI assistant in Core

## Current boundary

The UI uses the existing authenticated BFF. Core owns the official `openai`
Node SDK, credentials, model selection, provider URL and request limits. No AI
key or provider address is returned to the browser. System defaults are stored
in `asmblyr_settings` by migration `20260930070000_system_settings`.

- `GET /assistant/status`: authenticated availability/configuration summary.
  An enabled, configured client returns the model, supported settings and input
  limits. No key or invalid configuration returns `available: false`; invalid
  configuration logs a sanitized warning and does not prevent Core startup.
- `POST /assistant/messages`: `{ messages: [{ role, content }], settings?:
{ reasoningEffort?, thinking? }, context? }` → `{ data: { content, truncated, proposals? } }`.
  System/developer/tool messages and arbitrary request/provider overrides are
  rejected. Core combines fixed runtime context with administrator instructions.
- Both routes require an active human account and the same basic entry condition
  as the admin shell: superuser or a read/create/update collection grant.
  Service principals are rejected. A dedicated AI permission can follow the
  product's future module-permission design.
- Availability means **configured**, not an upstream health or balance check.
  Status requests never generate paid tokens. Temporary provider errors remain
  visible in the chat with a retry action rather than destroying the dialog.

Conversation text and assistant instructions are sent to the configured provider.
Optional page/workspace/table context enables schema inspection, validated
filter proposals, collection discovery and bounded search/read/count tools in
permitted MCP-enabled collections through the [internal MCP](internal-mcp.md):
see [Contextual assistant](assistant-context.md). Requested readable record values
are sent to the configured provider; this is explained in the chat and settings.
Record values, filenames, unsaved drafts and user profile fields are not attached automatically.
Discussion comments/notifications remain independent local mocks. No database
write tools or arbitrary Adaptive Cards execution are enabled.

## Configuration and UI settings

| Setting                        | Location                                | Behavior                                                                                                            |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`               | Core environment                        | Required to enable the optional client                                                                              |
| `OPENAI_API_MODEL`             | Core environment                        | Explicit model ID; no implicit paid-model selection                                                                 |
| `OPENAI_API_BASE_URL`          | Core environment                        | Defaults to `https://api.openai.com/v1/`; custom HTTPS providers allowed; HTTP loopback for development             |
| `OPENAI_API_MODE`              | Core environment                        | `responses` for the official OpenAI endpoint; `chat-completions` for a custom endpoint unless explicitly configured |
| `ASSISTANT_ENABLED`            | Core environment                        | `false` disables the integration even with a key; UI cannot override this                                           |
| `OPENAI_API_TIMEOUT_MS`        | Core environment                        | 120000 by default; bounded to 1000–120000                                                                           |
| `OPENAI_API_MAX_OUTPUT_TOKENS` | Core environment                        | 4096 by default; bounded to 128–16384                                                                               |
| `OPENAI_API_MODEL_EFFORT`      | Core default + UI override              | Depth selector in the assistant header; only values advertised by Core are accepted                                 |
| `OPENAI_API_MODEL_THINKING`    | Z.ai default + UI override if supported | Z.ai extension; omitted for official OpenAI requests                                                                |

The system page `/system-settings` (sidebar: Settings) is accessible only to
superusers. `GET /settings/assistant` returns a safe configuration summary;
`PUT /settings/assistant` saves the `{ enabled, reasoningEffort,
thinking, instructions }` object. No generic arbitrary-settings or secret-management API is
exposed. Both routes require an active human superuser; regular users and
service accounts are rejected in Core, not just hidden in navigation.

System values are persisted as one JSONB object under key `assistant` in
`public.asmblyr_settings`; `null` effort/thinking inherits Core defaults.
Writes and a `settings.assistant.update` security event commit atomically.
Reads use the primary key, with no process-local cache: subsequent status and
message requests see saved changes across Core processes without a restart.
The environment-level disable or missing provider configuration still wins.
Disabling in the UI rejects new requests and hides the AI tab when status is
refreshed. Already-running responses may finish. Status refreshes on panel
open/close, window focus, and settings save in the same window.

Precedence: explicit dialog value > compatible saved system value > Core
environment default. Overrides incompatible with a newly configured model are
ignored and can be replaced from the page. Switching off AI does not affect
discussion or notification mocks. The migration adds only a new table, leaves
existing behavior intact when no values are saved, and refuses rollback while
settings rows exist; no destructive rollback was performed.

The quick settings in the chat affect following requests in the current mounted
admin shell. They survive panel close and client navigation, reset after
reload/logout, and can be reset with “Use system settings”.
The model is displayed read-only; users cannot select arbitrary models/endpoints.

### Assistant instructions

The Instructions editor sets the assistant's role, tone and response format.
`instructions: null` inherits the bundled template. A custom value is plain text
(1–8000 characters), trimmed on save; blank strings, NUL/control characters and
non-strings are rejected. Newlines and tabs are allowed. Restoring the template
is a draft change until the user saves it. It leaves other settings intact.

Existing JSONB rows without this property inherit the template, so no additional
migration is needed. Older clients omitting the property preserve the saved text.
Only the superuser settings endpoint returns/updates it: ordinary assistant
status does not expose the text, and message requests cannot override it via a
top-level property or per-dialog settings.

Each request uses the latest saved text. In-flight requests retain their original
instructions; displayed history is unchanged. Core composes a fixed description
of the runtime (plain chat or available page-context tools) with the selected role/style
instructions for both OpenAI Responses and compatible Chat Completions. This
description guides the model; actual data access remains enforced by which data
and tools the application supplies, not by prompt wording.

Instructions are stored only in the settings row, not copied into the security
event: the event records actor/time and the instruction source, length and SHA-256.
They are not credentials or a secret vault; the model receives them with each
request and may discuss their content.

The current Z.ai `glm-5.3` integration uses Chat Completions at the configured
endpoint. Its thinking mode is mandatory, so the UI offers `low`, `high`, `max`
(“Быстро”, “Вдумчиво”, “Максимальная глубина”) and no off switch. An incompatible
`thinking=false` or `medium` is rejected. Other Z.ai chat models may expose the
existing optional thinking switch; model-specific compatibility must be checked
when selecting a different model. Generic OpenAI-compatible services vary in
their supported parameters.

Z.ai has separate endpoints for regular API billing
(`https://api.z.ai/api/paas/v4/`) and a GLM Coding Plan subscription
(`https://api.z.ai/api/coding/paas/v4/`). Set the endpoint matching the key's
package; a Coding Plan key on the regular endpoint can return quota code `1113`.

## Streaming text (2026-10-03)

The admin chat requests `application/x-ndjson` through the authenticated BFF.
Core enables provider SSE streaming for these requests; callers requesting JSON
still receive one complete answer. No provider credentials reach the browser.

- `started` supplies the owner-bound cancellation ID; `progress` reports model/tool work.
- `text-delta` carries public text or refusal text as `{ delta, reset }`. The first
  fragment of each model step has `reset: true`: this starts another paragraph,
  preserving the public explanations and calculations from preceding steps.
- `answer.content` contains all public model steps in order, separated by blank
  lines. It finalizes the same message without appending duplicate text, and attaches
  verified cards and usage. JSON callers receive the same complete text. A plugin
  button supplements the calculation instead of replacing it with a short conclusion.
  `error` marks cancellation/failure; it is not a successful answer.
- Responses text/refusal events and Chat Completions deltas are supported. Tool
  arguments are assembled before execution. Z.ai `reasoning_content` and Responses
  encrypted reasoning are kept only for the provider continuation, never streamed
  to the UI or persisted in telemetry.
- Chat requests include final usage. An interrupted stream retains whatever
  metadata actually arrived; missing counters stay unknown. No retry is automatic.
- UI batches text updates every 32 ms and flushes the last batch on completion or
  error. One message ID is preserved throughout the turn. Stop and network errors
  keep partial text visible; incomplete turns are excluded from later model history.
- shadcn auto-scroll follows content growth until the user scrolls away. Returning
  to the end or using the scroll button resumes it. Sending a new message also
  scrolls to the end and resumes following, including suggestions and retries.
  Incoming tokens alone never override manual scrolling. There is no artificial typing delay.

The response length limit applies to each model step; the timeout covers the turn.
The visible transcript retains all steps. For follow-ups, UI keeps the last 8000
characters of a long reply (including the final result) within the existing input
message budget, then removes older complete turns to fit the conversation budget.
Cards are attached only with a successful final answer. Early EOF without a provider completion event
is an error, including when partial tool arguments have already arrived.

Verification covers delayed SSE delivery before completion, split tool arguments,
private-reasoning continuity, refusal/truncation, cancellation through the HTTP route,
usage, retained multi-step calculations, finalization without duplicates and bounded
follow-up history. Run `node scripts/test.mjs core-assistant` and
`node scripts/test.mjs ui-unit`; integration tests use a disposable PostgreSQL database.

A live check against the configured GLM provider received the first public text
after 3.2 seconds and completed after 10.3 seconds (334 fragments); final token
usage was returned. This checks the provider adapter; HTTP/UI behavior is covered
by the automated stream and state tests above.

Browser regression check (2026-10-03): the calculator's multi-step explanation,
10 800 RUB total and prepared-form button remained together after three model
calls and two tools. Sending from the top of history scrolled to the new message;
scrolling up during the next streamed reply stayed at the top as text grew.

## Limits, errors and cancellation

- One in-flight request per user, at most 16 per Core process, 10 requests per
  user per minute. These are per-process limits, not distributed quota/billing.
- At most 31 alternating user/assistant messages, 8000 characters per message,
  32000 total and a 160000-byte HTTP body. UI trims complete old turns to fit;
  displayed messages remain in memory. Overlong output is marked truncated.
- SDK retries are disabled. An upstream error never silently repeats a paid
  request. BFF session refresh still retries only an authentication rejection.
- Provider errors are mapped to safe application messages. Credentials, raw
  provider errors, prompts and responses are not logged by this integration.
  OpenAI insufficient quota and Z.ai `1113` receive a distinct quota error.
- Request cancellation flows from the UI through the BFF to Core and the SDK;
  transport timeouts are bounded. Closing the panel lets a reply finish.
  New dialog/logout/unmount cancels the active client request and ignores stale
  responses. Cancellation does not guarantee reversal of provider billing.
- The OpenAI Responses path uses `store: false` and sends bounded context
  explicitly. Asmblyr stores no conversation in the database. Provider-side
  retention remains subject to that provider's policy; Z.ai-specific retention
  is not inferred from OpenAI semantics.
- Markdown is rendered without raw HTML; remote images do not load automatically.

## Verification (2026-09-30)

AI provider attempts now have a durable, metadata-only request journal and an
administrator telemetry tab. See [AI request telemetry](assistant-telemetry.md)
for storage, usage semantics, retention, API and failure behavior. Conversation
text remains outside the database.

- `pnpm --filter @asmblyr/core test:assistant`: configuration, malformed input,
  provider wire format, failures, quota handling, output limits, cancellation,
  concurrency and live PostgreSQL authorization/disabled-mode integration.
- UI conversation-budget and BFF session/cancellation tests.
- System settings integration: 401/403 for unauthorized users and services,
  strict input, credential isolation, persistence/audit, live default changes,
  per-dialog overrides, disabling requests and environment-disable precedence.
- Instructions: legacy-row/client compatibility, text validation, persistence,
  reset, audit fingerprint, rejected per-message overrides and both provider
  formats with fixed runtime context. Provider tests use a fake transport.
- Core/UI typecheck and lint, plus browser inspection of availability, real
  request error handling and the GLM depth selector.
- The initial regular Z.ai endpoint returned HTTP 429/code `1113`. After the
  user identified their key as GLM Coding Plan, only the local endpoint was
  changed to `/api/coding/paas/v4/`. A real `glm-5.3` reply was then received and
  displayed in the chat. Credentials were not printed or modified; the OpenAI
  Responses path was tested with an injected transport.

## Sources

- [OpenAI streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Official OpenAI Node/TypeScript SDK](https://developers.openai.com/api/reference/typescript/)
- [OpenAI text generation: instructions and message roles](https://developers.openai.com/api/docs/guides/text)
- [GLM-5.3 supported modes and reasoning parameters](https://docs.z.ai/guides/llm/glm-5.3)
- [Z.ai error codes](https://docs.z.ai/api-reference/api-code)
