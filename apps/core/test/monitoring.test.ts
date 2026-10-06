import assert from "node:assert/strict";
import test from "node:test";
import {
  monitoringBrowserRoute,
  sanitizeMonitoringEvent,
} from "@asmblyr-collaborative/contracts";
import { RollingMetrics } from "../src/monitoring/metrics.js";
import {
  monitoringDefaults,
  monitoringFromEnv,
  monitoringValue,
  validateSentryDsn,
} from "../src/monitoring/config.js";
import {
  createSentrySink,
  type RequestMeasurement,
} from "../src/monitoring/sentry.js";

test("rolling percentiles are exact, bounded, expire and distinguish 5xx from 4xx", () => {
  let now = 1000;
  const metrics = new RollingMetrics(() => now);
  for (let index = 1; index <= 100; index++)
    metrics.record("GET /items/:collection", index, index === 100 ? 500 : 400);
  metrics.record("GET /items/:collection", NaN, 200);
  assert.deepEqual(metrics.snapshot()[0], {
    route: "GET /items/:collection",
    samples: 100,
    limited: false,
    errors: 1,
    p50Ms: 50,
    p95Ms: 95,
    p99Ms: 99,
  });
  for (let index = 101; index <= 2100; index++)
    metrics.record("GET /items/:collection", index, 200);
  assert.equal(metrics.snapshot()[0].samples, 2000);
  assert.equal(metrics.snapshot()[0].limited, true);
  assert.equal(metrics.snapshot()[0].p50Ms, 1100);
  for (let index = 1; index <= 128; index++)
    metrics.record(`GET /route_${index}`, 1, 200);
  assert.equal(metrics.snapshot().length, 128);
  assert.equal(metrics.routesLimited, true);
  now += 900001;
  assert.deepEqual(metrics.snapshot(), []);
  assert.equal(metrics.routesLimited, false);
  metrics.record("GET /new", 10, 200);
  metrics.clear();
  assert.deepEqual(metrics.snapshot(), []);
});

test("optional env shares a DSN across targets and validates sampling, environment and DSN", () => {
  assert.equal(monitoringFromEnv({}).enabled, false);
  const core = monitoringFromEnv({ SENTRY_DSN: "https://abc@example.test/1" });
  assert.equal(core.enabled, true);
  assert.equal(core.errorsCore, true);
  assert.equal(core.errorsBrowser, true);
  assert.equal(
    monitoringFromEnv({
      SENTRY_ENABLED: "false",
      SENTRY_DSN: "https://abc@example.test/1",
    }).enabled,
    false,
  );
  for (const tracesSampleRate of [NaN, Infinity, -1, 1.1, "0.5"]) {
    assert.throws(() =>
      monitoringValue({ ...monitoringDefaults, tracesSampleRate }),
    );
  }
  for (const environment of [
    "None",
    "prod/test",
    "x".repeat(65),
    "my environment",
  ]) {
    assert.throws(() =>
      monitoringValue({ ...monitoringDefaults, environment }),
    );
  }
  for (const dsn of [
    "https://host.test/1",
    "https://abc:secret@host.test/1",
    "http://abc@host.test/1",
    "https://abc@host.test/1?secret=x",
  ]) {
    assert.throws(() => validateSentryDsn(dsn));
  }
  assert.equal(
    validateSentryDsn("http://abc@localhost:9000/1"),
    "http://abc@localhost:9000/1",
  );
});

test("privacy boundary removes scopes, payloads, SQL, user data and raw error messages", () => {
  const event = sanitizeMonitoringEvent({
    message: "private-message",
    transaction: "private-transaction",
    contexts: {
      trace: {
        op: "private-operation",
        status: "private-status",
        data: { user: "private-user" },
      },
    },
    user: { email: "private-email" },
    request: {
      url: "private-url",
      headers: { authorization: "private-token" },
      data: "private-body",
    },
    extra: { secret: "private-key" },
    breadcrumbs: [{ message: "private-breadcrumb" }],
    exception: {
      values: [
        {
          type: "PrivateError",
          value: "private-value",
          stacktrace: {
            frames: [
              {
                filename: "C:/private-user/file.ts",
                vars: { password: "private-password" },
                context_line: "private-source",
              },
            ],
          },
        },
      ],
    },
    tags: { route: "GET /items/:collection", sensitive: "private-tag" },
    spans: [
      {
        description: "SELECT private-field FROM private-table",
        data: { bindings: "private-bindings" },
      },
    ],
  });
  assert.equal(JSON.stringify(event).includes("private-"), false);
  assert.equal(event.tags.route, "GET /items/:collection");
  assert.equal(
    event.exception!.values[0].stacktrace!.frames[0].filename,
    "file.ts",
  );
  for (const path of [
    "/items/private_name/secret-id?q=private-value",
    "/api/items/private_name/secret-id?q=private-value",
    "/admin/settings/private_section",
    "/some/private-page",
  ]) {
    assert.equal(monitoringBrowserRoute(path).includes("private"), false);
    assert.equal(monitoringBrowserRoute(path).includes("secret"), false);
  }
});

test("real Sentry SDK emits redacted errors and timed transactions through an offline transport", async () => {
  const envelopes: unknown[] = [];
  const beforeExitListeners = process.listenerCount("beforeExit");
  const sink = await createSentrySink(
    { ...monitoringDefaults, enabled: true, performanceCore: true },
    "https://abc@example.test/1",
    () => ({
      send(envelope) {
        envelopes.push(envelope);
        return Promise.resolve({});
      },
      flush() {
        return Promise.resolve(true);
      },
    }),
  );
  const measurement: RequestMeasurement = {
    route: "GET /items/:collection",
    method: "GET",
    requestId: "req-1",
    started: 1,
    timestamp: 1000,
    duration: 42,
    status: 200,
    sampled: true,
    finished: true,
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    spans: [
      {
        trace_id: "a".repeat(32),
        span_id: "c".repeat(16),
        parent_span_id: "b".repeat(16),
        start_timestamp: 1000,
        timestamp: 1000.01,
        op: "db",
        description: "SELECT",
        data: { bindings: "private-bindings" },
      },
    ],
  };
  sink.error(
    new Error("private-user-message"),
    measurement.route,
    "GET",
    "req-1",
    500,
  );
  sink.transaction(measurement);
  await sink.close();
  const serialized = JSON.stringify(envelopes);
  assert.equal(serialized.includes("private-"), false);
  const events = (
    envelopes as [unknown, [unknown, Record<string, unknown>][]][]
  ).flatMap((envelope) => envelope[1].map((item) => item[1]));
  assert.equal(events.length, 2, serialized);
  const transaction = events.find((event) => event.type === "transaction")!;
  assert.equal(transaction.transaction, "GET /items/:collection");
  assert.ok(
    Math.abs(
      (Number(transaction.timestamp) - Number(transaction.start_timestamp)) *
        1000 -
        42,
    ) < 0.001,
  );
  assert.equal((transaction.spans as unknown[]).length, 1);
  assert.equal(process.listenerCount("beforeExit"), beforeExitListeners);
});
