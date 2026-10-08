<a id="мониторинг-и-sentry"></a>

# Monitoring and Sentry

Monitoring is optional and disabled by default. Only superusers access `/admin/settings/monitoring`. A right-side editor saves settings through the existing [connections and encryption](./connections.md) mechanism. New and existing installations work without Sentry, DSNs, or extra migrations.

<a id="подключение"></a>

## Connection

The editor separates Server (Core/API) and Interface (browser) tabs. Enter a DSN and select collection options for each. Use one Sentry project with the same DSN in both tabs, or separate projects. Choose Node.js for the server and Browser JavaScript for the browser. The `component` tag distinguishes `core` and `browser`.

Enablement, environment, release, and trace sample rate are shared. To monitor one side only, disable collection for the other. Both error switches default on; performance and SQL spans default off. If a required DSN is missing, the editor opens its tab.

| Switch                | Collected data                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Server errors         | Unexpected API handler errors with 5xx status                                                   |
| Interface errors      | JavaScript errors and unhandled Promise rejections in the authenticated admin                   |
| API performance       | Request duration through response completion; local p50/p95/p99 and sampled Sentry transactions |
| Interface performance | Current-load Navigation Timing and new same-origin fetch/XHR to selected admin APIs             |
| SQL duration          | Database spans in sampled API traces, with operation type and duration only                     |

Trace sampling ranges from 0–100% and controls performance submission, not errors. Local percentiles use all measured requests, even at 0% sampling. Disabled collection does not instantiate the SDK; browsers do not load its package or install handlers.

Test checks DSN format and saved-key availability without sending an event. It does not prove delivery to Sentry. Enable the relevant collection and verify received events in your Sentry project.

<a id="p95-p99-и-пределы-измерении"></a>

## p95/p99 and measurement limits

The local table covers the **current Core instance**, the last 15 minutes, and up to 2,000 observations per route. Over the cap, it retains the latest observations and marks the limit. Up to 128 routes are supported, also with a limit indicator. This is bounded in-memory diagnostics, without database accumulation. Restarting or disabling collection clears it. Load-balanced requests may reach different processes; use Sentry for aggregate observations.

p95 means 95% of measured requests took no longer than the displayed duration; p99 means 99%. Calculation uses nearest rank. The admin shows p95 from 20 observations and p99 from 100. These are display thresholds, not guarantees of statistical stability. Sentry computes percentiles over submitted traces and the selected period; small samples may misrepresent rare delays.

Core duration excludes external network and browser time; streaming includes the full response transfer. Browser Timing is separate: do not combine these series. SQL spans exclude connection-pool wait, shown as a separate current queue counter. RSS/heap show current process memory. Event-loop p99 covers the period since enabling collection, at 20 ms resolution.

<a id="данные-и-жизненныи-цикл"></a>

## Data and lifecycle

A shared allowlist retains error type/location, sanitized stack (file basename, line, function), route template, durations, and technical environment/release settings. Error text is replaced with a generic message. URL values, queries, headers, cookies, request/response bodies, records, assistant messages, SQL, bindings, users, and breadcrumbs are excluded. Collection names and IDs become route parameters. Logs, Replay, and CPU profiling are not enabled.

Sentry receives network connections from Core or browsers and may process network metadata under its settings. Operators choose Sentry and its data-processing configuration. The browser DSN contains a public event-ingestion key visible to authenticated users when browser monitoring is enabled. A separate server DSN is never sent to browsers. A DSN is not a Sentry administration token; never supply one as a DSN.

Saved DSNs use the same encryption as other connection secrets; settings responses expose only separate presence flags. Changes apply immediately on the saving instance. Other instances reload every five seconds; browsers every 30 seconds and after local saves. Hidden tabs pause polling and resume when visible.

Invalid configuration disables monitoring while core product functions continue. Monitoring can be disabled without changing DSNs even when KMS is unavailable; saved keys remain in the database.

Core excludes health/ready, auth, OAuth, personal connections, monitoring configuration, and unknown routes. Browser resource timings cover items, collections, files, preferences, presence, notifications, and assistant APIs. This connection does not automatically collect Next.js SSR errors, React error boundaries, or background errors outside HTTP requests.

<a id="конфигурация-через-env"></a>

## Environment configuration

Any nonempty setting below locks the group in the admin. Edit locked values in server configuration. `SENTRY_ENABLED=false` explicitly disables and locks the group.

| Variable                     | Default / value                                             |
| ---------------------------- | ----------------------------------------------------------- |
| `SENTRY_ENABLED`             | true when a DSN is set; otherwise false                     |
| `SENTRY_DSN`                 | Server DSN: HTTPS, public key, numeric project ID           |
| `SENTRY_BROWSER_DSN`         | Browser DSN; falls back to SENTRY_DSN                       |
| `SENTRY_ENVIRONMENT`         | production; up to 64 characters, no whitespace/slashes/None |
| `SENTRY_RELEASE`             | Empty; up to 120 characters                                 |
| `SENTRY_ERRORS_CORE`         | true when server DSN exists                                 |
| `SENTRY_ERRORS_BROWSER`      | true when browser DSN exists                                |
| `SENTRY_PERFORMANCE_CORE`    | false                                                       |
| `SENTRY_PERFORMANCE_BROWSER` | false                                                       |
| `SENTRY_DATABASE_SPANS`      | false; requires Core performance                            |
| `SENTRY_TRACES_SAMPLE_RATE`  | 0.1; number from 0 to 1                                     |

Booleans accept only true/false. HTTP DSNs are allowed only for loopback during local testing. DSNs with passwords, queries, or fragments are invalid. Invalid optional configuration disables monitoring and shows it as unavailable.

For backward compatibility, SENTRY_DSN also supplies the browser when SENTRY_BROWSER_DSN is absent. Server-only collection requires explicitly disabling SENTRY_ERRORS_BROWSER and SENTRY_PERFORMANCE_BROWSER. With only SENTRY_BROWSER_DSN configured, server errors default off.

The API accepts `secrets.serverDsn` and `secrets.browserDsn`. A previously saved shared DSN remains each side's fallback until editing keys. Replacing/removing one side preserves the other separately and removes the shared slot in the same transaction. Null removes that side's key; saving is rejected if its collection remains enabled. Both keys can be removed while monitoring is disabled.

The compatible `secrets.dsn` key can be supplied only without other keys. It sets a shared DSN and clears separate values; null removes all DSNs. Without key changes, ciphertext stays intact, including when disabling during a KMS outage. No database migration is needed.

`GET /monitoring/browser` requires an active human and returns only browser configuration. `GET /settings/monitoring` requires a human superuser and returns local metrics. Both use private, no-store. Save through `PUT /settings/integrations/monitoring`; test through `POST /settings/integrations/monitoring/test`, with shared optimistic revision and write-only-secret rules. See [OpenAPI](../reference/http.md).
