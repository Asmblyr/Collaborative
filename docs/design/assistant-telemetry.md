# AI request telemetry

## Scope and retention

Core journals new assistant provider attempts in `public.asmblyr_assistant_requests`.
The journal starts with migration `20260930080000_assistant_requests`; earlier
usage cannot be reconstructed. Detailed rows are kept **without automatic
deletion**, as agreed on 2026-09-30. No retention job, token quota or pricing
engine is introduced.

The UI lives under **Settings → AI assistant → Telemetry**. It shows requests
from all users, summary counts, input/output totals, period selection and cursor
pagination. It is restricted to active human superusers by Core, including when
the assistant is disabled. Ordinary users and service accounts cannot read it.

## Recorded data

Contextual messages can require several provider calls. Each call is recorded
separately and contributes its actual token usage to totals. Migration
`20260930090000_assistant_turns` adds grouping and backfills existing requests
as individual turns. The UI shows a short turn ID and call number. See
[Contextual assistant](assistant-context.md) for execution limits.

| Data                                         | Meaning                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `user_id`                              | Core request UUID and authenticated actor UUID; never supplied by the chat body                                                                                              |
| `turn_id`, `call_index`                      | Server-generated user-message group and sequential model call (1 and above); includes schema/tool continuations                                                              |
| `started_at`, `finished_at`, `duration_ms`   | UTC timestamps and elapsed duration, measured with a monotonic clock from journal admission until provider result; includes the initial journal write, excludes finalization |
| `provider`, `api`                            | `openai`, `zai` or `compatible`; Responses or Chat Completions                                                                                                               |
| `requested_model`, `model`                   | Model requested by Core and actual model reported by provider; actual model stays null when unavailable                                                                      |
| `reasoning_effort`, `thinking`               | Effective options sent for this request; unsupported or unsent settings stay null                                                                                            |
| `status`, `error_code`, `truncated`          | Pending, succeeded, failed or cancelled; safe Core error code; whether visible output was truncated                                                                          |
| Token counters                               | Input, output, total, cached input and reasoning output reported by provider                                                                                                 |
| `response_id`, `request_id`, `finish_reason` | Bounded provider identifiers and completion reason, when returned                                                                                                            |

No prompts, answers, reasoning text, instructions, API keys, base URLs, raw errors,
IP addresses or profile snapshots are stored here. The reader joins current user
display name/email. Deleting an account preserves its actor UUID and request
history, with no cascading deletion and no retained email/name snapshot.

Usage mapping:

- Responses: `input_tokens`, `output_tokens`, `total_tokens`,
  `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens`.
- Chat Completions: `prompt_tokens`, `completion_tokens`, `total_tokens`,
  `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`.
- Missing or invalid counters are **null, not zero**. Genuine zero is preserved.
  No local tokenizer or estimate fills missing values.
- Cached tokens are part of input; reasoning tokens are part of output. They
  must not be added to totals again. Output can include invisible reasoning.
- Each turn includes its submitted history and instructions in input usage.
  This is per-request provider usage, not the size of the latest chat message.
- Totals sum only reported counters; the UI shows how many attempts returned
  both input and output counts. A missing sum displays “—”. Failed attempts may
  have consumed tokens, so their known usage is included.
- Token usage is not an invoice. GLM Coding Plan subscription limits and actual
  charges cannot be inferred by multiplying these counts by regular API prices.

## Request lifecycle

1. Authenticate, authorize and validate input; apply local concurrency/rate limits.
   Rejections at this stage do not create provider-attempt records.
2. Insert a `pending` row before calling the provider. If insertion fails, return
   a safe 503 without invoking the model.
3. Make one SDK call with automatic retries disabled. Capture allowlisted
   metadata before validating visible output, preserving usage even for an empty
   answer or failed/malformed output.
4. Finalize the row on success, error, timeout or cancellation. Transport failures
   and cancellation often have unknown usage; cancellation is not proof that
   billing stopped. HTTP error request IDs are retained when available.
5. If finalization fails, return the provider result and log only the Core request
   UUID with a fixed warning. The initial row remains pending. No paid retry is
   made and no success is discarded because a journal update failed.

Journal write queries have a 5-second query timeout. Connection acquisition is
subject to the configured Knex pool timeout. A process crash can leave a pending
row. After three minutes the UI labels it “Нет итога”, without inventing a failure
or zero usage. There is no reconciliation worker yet. Explicit manual retry is
a new request and a separate record.

### Whole-message summaries (2026-10-01)

There is no fixed model-call or tool-call count budget. Migration
`20261001060000_assistant_turn_metrics` removes the database upper bound on
`call_index` and adds `public.asmblyr_assistant_turns`. Old request history is
preserved; old turn durations and tool counts are not fabricated.

A turn is admitted before the first provider call and finalized after the entire
loop. It stores actor ID, timestamps and a bounded JSON summary: requested and
reported model names, model calls, attempted tool calls and tool errors, elapsed
time, final status/error code, known token sums and sample counts per counter.
Invalid arguments and returned tool errors count as failed tool attempts; aborted
calls that have not started do not count. No tool arguments/results are stored.
Failures between model calls (including tool-result size and cancellation) are
recorded in the turn even when every completed model request succeeded.

Chat returns `{ data: { content, truncated, summary, proposals? } }`. Safe failure
responses can include `summary` too. The UI shows a compact factual footer,
excluded from history sent to the model. Missing counters remain null, partial
sums show `≥` and an explanation. Detailed telemetry offers a whole-message
summary alongside each model call. Token totals still count each call once.
Connection loss can prevent delivery of the footer; server journaling still
finalizes the cancelled turn. If finalization fails or the process crashes, a
turn can remain unfinished, just like a model request.

The whole-loop timeout, cancellation, argument/result size, message length,
output tokens, rate/concurrency and authorization protections remain in place.
The current maximum configured loop timeout is 120 seconds. Count budgets can
be selected later using recorded turn metrics. Rollback refuses to discard
populated turn history or reinstate a limit incompatible with existing calls.

## Connection failures

`assistant_network_denied` means that the Core process cannot open an outbound
connection (`EACCES` / `EPERM`), including mixed IPv4/IPv6 connection errors.
`assistant_network` covers other transport failures; HTTP provider failures keep
their existing quota, configuration, rate-limit or unavailable codes. No raw
socket/provider errors are sent to clients or saved in telemetry.

A locally launched Core can serve `/health` and `/ready` while its process sandbox
blocks internet access. Launch the development service in the normal user
environment with outbound access to the configured provider. Do not change
firewall rules or disable TLS checks to compensate. Verify one assistant request
after restart; readiness alone does not test the external AI connection.

## Reader API and storage

`GET /settings/assistant/telemetry` supports:

- `days`: `1`, `7` (default), `30`, `90`.
- `until`: optional UTC ISO timestamp, e.g. `2026-09-30T15:00:00.000Z`. Allows
  historical windows; the UI currently offers trailing periods only.
- `userId`: optional actor UUID, including deleted accounts.
- `cursor`: opaque cursor from `nextCursor`.

Response `data` contains `items`, `nextCursor`, `period` and `summary`. Pages have
at most 25 rows, ordered by `(started_at DESC, id DESC)`. Keep `days`, `until` and
`userId` unchanged when following a cursor. The UI freezes the time window while
paging; Refresh resets it. In-flight requests may still finalize between pages.
One response reads the page and aggregate in a repeatable-read transaction.

Time and user/time B-tree indexes support keyset pagination and bounded-period
queries. Timestamp precision is milliseconds, matching the cursor serializer.
Summary computation scans the selected window, not the entire retained history;
at higher volume, daily aggregates can be added separately. No partitioning or
aggregation infrastructure is needed for the initial journal.

Migration adds a table and indexes without rewriting existing data. `/ready`
requires the table. Rollback refuses to drop any populated journal; no destructive
rollback was performed.

## Verification (2026-09-30)

- Focused provider tests use injected transports: both usage formats, missing vs
  zero, subset counters, actual model, output limits, malformed/empty replies,
  safe error identifiers, cancellation and journal failure paths.
- PostgreSQL integration verifies pending-before-call, successful/error/cancelled/
  timed-out completion, authorization, bounded pagination with equal timestamps,
  account-deletion survival, missing usage and non-destructive rollback refusal.
- A real browser request to configured `glm-5.3` returned an answer and a journal
  row with **183 input / 4 output tokens**, including reported cache/reasoning
  counters of zero. This verifies the current Coding Plan endpoint end to end;
  it does not guarantee that every model or error returns the same counters.

## Verification (2026-10-01)

- 36 focused Core assistant tests and 47 UI unit tests passed; Core/UI typecheck,
  changed-file ESLint and Prettier checks passed. Integrations ran in a disposable
  test database. Local migration applied as batch 40; `/ready` returns ready.
- Both provider formats completed 8 model calls / 7 tool calls in regression
  tests. Incomplete tool calls never execute; whole-turn timeout/cancellation
  still stop continuations. Known error usage, missing/zero/partial counters,
  failure between model calls and refusal of destructive rollback are covered.
- Live GLM-5.3 chat answered “Сколько активных категорий Ozon у клиента Nestlé?”
  with **48**, independently verified by a read-only SQL count using shop 4,
  the exact Nestle client and `status = published`.
- That turn used **9 model calls, 11 tool calls, 1 recoverable tool error,
  67.097 seconds, 54,660 input and 1,845 output tokens**. All 9 calls reported
  usage. The saved turn summary matches the chat footer. This is one observed
  run, not a latency or usage guarantee.
- Chat footer screenshot (локальный артефакт, не публикуется).

## Sources

- [OpenAI reasoning usage and output limits](https://developers.openai.com/api/docs/guides/reasoning)
- [Z.ai Chat Completions response schema](https://docs.z.ai/api-reference/llm/chat-completion)
- Installed official OpenAI Node SDK `7.23.0`, Responses and Chat Completion usage types.
