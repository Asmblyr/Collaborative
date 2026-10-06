import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { MonitoringConnection } from "@asmblyr-collaborative/contracts";
import { IntegrationService } from "../src/integrations/service.js";
import { monitoringDefaults } from "../src/monitoring/config.js";
import { monitoringSecretSlots } from "../src/monitoring/dsn.js";
import { MonitoringRuntime } from "../src/monitoring/runtime.js";
import type { MonitoringSinkFactory } from "../src/monitoring/sentry.js";
import { integrationsFixture } from "./support/integrations-fixture.js";

const shared = "https://abc@shared.example.test/1";
const server = "https://def@server.example.test/2";
const browser = "https://ghi@browser.example.test/3";
const enabled = { ...monitoringDefaults, enabled: true };
const offline: MonitoringSinkFactory = async () => ({
  error() {},
  transaction() {},
  async close() {},
});

test("split DSNs preserve an existing common key and isolate edits/removal", async (t) => {
  const f = await integrationsFixture(offline);
  t.after(() => f.close());
  let coreDsn = "";
  const runtime = new MonitoringRuntime(f.settings, async (value, dsn) => {
    coreDsn = dsn;
    return offline(value, dsn);
  });
  t.after(() => runtime.close());
  const save = async (
    secrets?: Record<string, string | null>,
    value: MonitoringConnection = enabled,
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
    "common DSN is read for both targets without rewriting ciphertext",
    async () => {
      await save({ dsn: shared });
      const before = await f.settings.row();
      assert.deepEqual((await f.settings.snapshot()).monitoring.secrets, {
        serverDsn: true,
        browserDsn: true,
      });
      assert.deepEqual(await f.settings.reveal(before, "monitoring"), {
        serverDsn: shared,
        browserDsn: shared,
      });
      await save(undefined, { ...enabled, environment: "staging" });
      assert.deepEqual((await f.settings.row()).secrets, before.secrets);
      await runtime.refresh();
      assert.equal(coreDsn, shared);
      assert.equal(runtime.browserConfig().dsn, shared);
    },
  );

  await t.test(
    "replacing server DSN preserves the old browser target with its own encryption context",
    async () => {
      await save({ serverDsn: server });
      const row = await f.settings.row();
      assert.equal(row.secrets["monitoring.dsn"], undefined);
      assert.ok(row.secrets["monitoring.serverDsn"]);
      assert.ok(row.secrets["monitoring.browserDsn"]);
      assert.equal(JSON.stringify(row).includes(shared), false);
      assert.deepEqual(await f.settings.reveal(row, "monitoring"), {
        serverDsn: server,
        browserDsn: shared,
      });
      await runtime.refresh();
      assert.equal(coreDsn, server);
      assert.equal(runtime.browserConfig().dsn, shared);
      assert.equal(
        JSON.stringify(runtime.browserConfig()).includes(server),
        false,
      );
    },
  );

  await t.test(
    "replacing browser DSN preserves the common server target",
    async () => {
      await save({ dsn: shared });
      await save({ browserDsn: browser });
      assert.deepEqual(
        await f.settings.reveal(await f.settings.row(), "monitoring"),
        { serverDsn: shared, browserDsn: browser },
      );
      await runtime.refresh();
      assert.equal(coreDsn, shared);
      assert.equal(runtime.browserConfig().dsn, browser);
      assert.equal(
        JSON.stringify(runtime.browserConfig()).includes(shared),
        false,
      );
    },
  );

  await t.test(
    "removing one target does not restore a legacy fallback and failures roll back",
    async () => {
      await save({ dsn: shared });
      await save({ serverDsn: null }, { ...enabled, errorsCore: false });
      const row = await f.settings.row();
      assert.deepEqual(await f.settings.reveal(row, "monitoring"), {
        browserDsn: shared,
      });
      assert.deepEqual((await f.settings.snapshot()).monitoring.secrets, {
        serverDsn: false,
        browserDsn: true,
      });
      await assert.rejects(save(), {
        code: "integration_sentry_server_dsn_missing",
      });
      assert.equal((await f.settings.row()).revision, row.revision);
      await assert.rejects(
        save({ browserDsn: null }, { ...enabled, errorsCore: false }),
        { code: "integration_sentry_browser_dsn_missing" },
      );
      assert.deepEqual((await f.settings.row()).secrets, row.secrets);
      await save({ browserDsn: null }, { ...enabled, enabled: false });
      const cleared = await f.settings.row();
      assert.equal(
        monitoringSecretSlots.some((slot) => cleared.secrets[slot]),
        false,
      );
      await runtime.refresh();
      assert.equal(runtime.browserConfig().dsn, "");
    },
  );

  await t.test(
    "legacy API accepts only an unmixed common patch and can clear both targets",
    async () => {
      await save({ serverDsn: server, browserDsn: browser });
      await assert.rejects(save({ dsn: shared, serverDsn: server }), {
        code: "integration_secret_invalid",
      });
      await save({ dsn: null }, { ...enabled, enabled: false });
      assert.deepEqual((await f.settings.snapshot()).monitoring.secrets, {
        serverDsn: false,
        browserDsn: false,
      });
    },
  );

  await t.test(
    "common ciphertext stays untouched when KMS is unavailable and monitoring is disabled",
    async () => {
      await save({ dsn: shared });
      await f.settings.save(
        "encryption",
        {
          revision: (await f.settings.row()).revision,
          value: {
            provider: "yandex-kms",
            keyId: "test-key",
            serviceAccountId: "test-account",
          },
        },
        f.actor,
      );
      const before = await f.settings.row();
      f.setRemoteUnavailable(true);
      try {
        await save(undefined, { ...enabled, enabled: false });
        assert.deepEqual((await f.settings.row()).secrets, before.secrets);
        await assert.rejects(save({ serverDsn: server }));
        assert.deepEqual((await f.settings.row()).secrets, before.secrets);
      } finally {
        f.setRemoteUnavailable(false);
      }
    },
  );
});

test("env DSNs target the correct clients and browser collection remains independent", async (t) => {
  const f = await integrationsFixture(offline);
  t.after(() => f.close());
  const cases: { env: NodeJS.ProcessEnv; core: string; ui: string }[] = [
    {
      env: { SENTRY_DSN: server, SENTRY_BROWSER_DSN: browser },
      core: server,
      ui: browser,
    },
    { env: { SENTRY_BROWSER_DSN: browser }, core: "", ui: browser },
    { env: { SENTRY_DSN: shared }, core: shared, ui: shared },
    {
      env: { SENTRY_DSN: server, SENTRY_ERRORS_BROWSER: "false" },
      core: server,
      ui: "",
    },
  ];
  for (const { env, core, ui } of cases) {
    const settings = new IntegrationService(f.db, { ...f.options, env });
    let coreDsn = "";
    const runtime = new MonitoringRuntime(settings, async (value, dsn) => {
      coreDsn = dsn;
      return offline(value, dsn);
    });
    try {
      const snapshot = await settings.snapshot();
      assert.equal(snapshot.monitoring.readOnly, true);
      assert.equal(snapshot.monitoring.secrets.serverDsn, Boolean(core));
      assert.equal(
        snapshot.monitoring.secrets.browserDsn,
        Boolean(env.SENTRY_BROWSER_DSN || env.SENTRY_DSN),
      );
      await settings.check("monitoring", {});
      await runtime.refresh();
      assert.equal(runtime.snapshot().issue, null);
      assert.equal(coreDsn, core);
      assert.equal(runtime.browserConfig().enabled, Boolean(ui));
      assert.equal(runtime.browserConfig().dsn, ui);
    } finally {
      await runtime.close();
    }
  }
});
