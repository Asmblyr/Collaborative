import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { IntegrationService } from "../src/integrations/service.js";
import { monitoringDefaults } from "../src/monitoring/config.js";
import { MonitoringRuntime } from "../src/monitoring/runtime.js";
import type {
  MonitoringSinkFactory,
  RequestMeasurement,
} from "../src/monitoring/sentry.js";
import { integrationsFixture } from "./support/integrations-fixture.js";

const offline: MonitoringSinkFactory = async () => ({
  error() {},
  transaction() {},
  async close() {},
});
const dsn = "https://abc@sentry.example.test/1";
const browserDsn = "https://def@browser.example.test/2";

test("optional monitoring: authorization, encrypted settings, request isolation, lifecycle and fail-open behavior", async (t) => {
  const f = await integrationsFixture(offline);
  t.after(() => f.close());
  const enabled = {
    ...monitoringDefaults,
    enabled: true,
    performanceCore: true,
    databaseSpans: true,
    tracesSampleRate: 1,
  };
  const save = async (
    value = enabled,
    secrets?: Record<string, string | null>,
  ) =>
    f.settings.save(
      "monitoring",
      {
        revision: (await f.settings.row()).revision,
        value,
        ...(secrets ? { secrets } : {}),
      },
      f.actor,
    );

  await t.test(
    "human authentication and superuser settings; only the browser DSN is exposed to a user",
    async () => {
      for (const path of ["/settings/monitoring", "/monitoring/browser"]) {
        assert.equal((await f.app.inject({ url: path })).statusCode, 401);
        assert.equal(
          (await f.app.inject({ url: path, headers: f.machine })).statusCode,
          401,
        );
      }
      assert.equal(
        (await f.app.inject({ url: "/settings/monitoring", headers: f.member }))
          .statusCode,
        403,
      );
      for (const method of ["PUT", "POST"] as const) {
        const url = `/settings/integrations/monitoring${method === "POST" ? "/test" : ""}`;
        assert.equal(
          (await f.app.inject({ method, url, payload: {} })).statusCode,
          401,
        );
        assert.equal(
          (await f.app.inject({ method, url, headers: f.member, payload: {} }))
            .statusCode,
          403,
        );
      }
      const before = await f.settings.row();
      const result = await f.app.inject({
        method: "PUT",
        url: "/settings/integrations/monitoring",
        headers: f.admin,
        payload: {
          revision: before.revision,
          value: enabled,
          secrets: { serverDsn: dsn, browserDsn },
        },
      });
      assert.equal(result.statusCode, 200, result.body);
      assert.deepEqual(result.json().data.monitoring.secrets, {
        serverDsn: true,
        browserDsn: true,
      });
      const row = await f.settings.row();
      for (const payload of [
        result.body,
        JSON.stringify(row),
        JSON.stringify(
          await f.db("asmblyr_security_events").where({ actor_id: f.actor }),
        ),
      ]) {
        assert.equal(payload.includes(dsn), false);
        assert.equal(payload.includes(browserDsn), false);
      }
      const config = await f.app.inject({
        url: "/monitoring/browser",
        headers: f.member,
      });
      assert.equal(config.statusCode, 200, config.body);
      assert.equal(config.json().data.dsn, browserDsn);
      assert.equal(config.body.includes(dsn), false);
      assert.equal(config.headers["cache-control"], "private, no-store");
      const stale = await f.app.inject({
        method: "PUT",
        url: "/settings/integrations/monitoring",
        headers: f.admin,
        payload: { revision: before.revision, value: enabled },
      });
      assert.equal(stale.statusCode, 409);
      await assert.rejects(save(enabled, { browserDsn: null }), {
        code: "integration_sentry_browser_dsn_missing",
      });
      await assert.rejects(
        save(enabled, { dsn: "https://abc:private@host.test/1" }),
        { code: "integration_sentry_dsn_invalid" },
      );
      assert.equal(
        (await f.settings.reveal(await f.settings.row(), "monitoring"))
          .serverDsn,
        dsn,
      );
    },
  );

  await t.test(
    "sampling affects outgoing traces only; concurrent DB spans are isolated and hooks detach",
    async () => {
      const traces: RequestMeasurement[] = [];
      const errors: unknown[] = [];
      let clients = 0;
      let closed = 0;
      let unavailable = false;
      const runtime = new MonitoringRuntime(
        f.settings,
        async (_value, configuredDsn) => {
          assert.equal(configuredDsn, dsn);
          clients++;
          if (unavailable) {
            throw new Error("transport unavailable");
          }
          return {
            error(error) {
              errors.push(error);
            },
            transaction(value) {
              traces.push(structuredClone(value));
            },
            async close() {
              closed++;
            },
          };
        },
      );
      const app = Fastify({ logger: false });
      runtime.register(app);
      app.get("/monitoring-test/:id", async (request) => {
        await f.db.raw("select pg_sleep(0.005), ?::text", [
          "private-bound-value",
        ]);
        if ((request.params as { id: string }).id === "bad") {
          throw new Error("private-error-value");
        }
        return { ok: true };
      });
      app.get("/auth/test", async () => {
        throw new Error("private-auth-value");
      });
      const beforeListeners = f.db.listenerCount("query");
      await app.ready();
      assert.equal(f.db.listenerCount("query"), beforeListeners + 1);
      try {
        await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            app.inject(`/monitoring-test/${index}?token=private-query`),
          ),
        );
        assert.equal(traces.length, 8);
        assert.equal(new Set(traces.map((trace) => trace.traceId)).size, 8);
        for (const trace of traces) {
          assert.equal(trace.route, "GET /monitoring-test/:id");
          assert.equal(trace.spans.length, 1);
          assert.equal(trace.spans[0].parent_span_id, trace.spanId);
          assert.equal(trace.spans[0].trace_id, trace.traceId);
          assert.equal(JSON.stringify(trace).includes("private-"), false);
        }
        await app.inject("/monitoring-test/bad");
        await app.inject("/auth/test");
        assert.equal(errors.length, 1);
        assert.equal(runtime.snapshot().routes[0].samples, 9);
        assert.equal(runtime.snapshot().routes[0].errors, 1);
        await save({ ...enabled, tracesSampleRate: 0 });
        await runtime.refresh();
        const count = traces.length;
        await app.inject("/monitoring-test/zero");
        assert.equal(traces.length, count);
        assert.equal(runtime.snapshot().routes[0].samples, 10);
        await save({ ...enabled, enabled: false });
        await runtime.refresh();
        assert.equal(f.db.listenerCount("query"), beforeListeners);
        await app.inject("/monitoring-test/off");
        assert.equal(traces.length, count);
        assert.deepEqual(runtime.snapshot().routes, []);
        assert.equal(runtime.browserConfig().dsn, "");
        unavailable = true;
        await save(enabled);
        await runtime.refresh();
        assert.equal(runtime.snapshot().issue, "configuration_unavailable");
        assert.equal(
          (await app.inject("/monitoring-test/unavailable")).statusCode,
          200,
        );
        assert.equal(f.db.listenerCount("query"), beforeListeners);
        unavailable = false;
        await runtime.refresh();
        assert.equal(runtime.snapshot().issue, null);
      } finally {
        await app.close();
      }
      assert.equal(closed, clients - 1); // The failed factory created no client.
      assert.equal(f.db.listenerCount("query"), beforeListeners);
    },
  );

  await t.test(
    "env is read-only, malformed optional env fails closed, and KMS outage still allows disable",
    async () => {
      const envSettings = new IntegrationService(f.db, {
        ...f.options,
        env: { SENTRY_DSN: dsn },
      });
      assert.equal((await envSettings.snapshot()).monitoring.readOnly, true);
      assert.equal(
        (await envSettings.snapshot()).monitoring.value.errorsBrowser,
        true,
      );
      await assert.rejects(envSettings.save("monitoring", {}, f.actor), {
        code: "integration_environment_locked",
      });
      const invalid = new MonitoringRuntime(
        new IntegrationService(f.db, {
          ...f.options,
          env: { SENTRY_TRACES_SAMPLE_RATE: "bad" },
        }),
        offline,
      );
      await invalid.refresh();
      assert.equal(invalid.snapshot().issue, "configuration_unavailable");
      assert.equal(invalid.browserConfig().enabled, false);
      await invalid.close();
      const row = await f.settings.row();
      await f.settings.save(
        "encryption",
        {
          revision: row.revision,
          value: {
            provider: "yandex-kms",
            keyId: "test-key",
            serviceAccountId: "test-account",
          },
        },
        f.actor,
      );
      f.setRemoteUnavailable(true);
      try {
        await save({ ...enabled, enabled: false });
        await assert.rejects(
          f.settings.check("monitoring", {
            revision: (await f.settings.row()).revision,
            value: { ...enabled, enabled: false },
          }),
        );
      } finally {
        f.setRemoteUnavailable(false);
      }
      assert.equal(
        (await f.settings.snapshot()).monitoring.value.enabled,
        false,
      );
    },
  );
});
