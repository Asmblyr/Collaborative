import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { loadPlugins } from "../src/plugins/load.js";
import { parseRegistryPackage } from "../src/plugins/registry-manifest.js";
import {
  disabledExtensionPackages,
  recordExtensionStartup,
  extensionStates,
  setExtensionEnabled,
} from "../src/plugins/registry-state.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

test("registry enforces RBAC, records desired state and preserves live runtime until restart", async (t) => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
  );
  const comments = plugins.find((plugin) => plugin.namespace === "comments")!;
  const fixture = await pluginItemsFixture({ plugins: [comments] });
  t.after(async () => {
    await fixture
      .db("asmblyr_extension_history")
      .where({ package_name: comments.name })
      .delete();
    await fixture
      .db("asmblyr_extension_states")
      .where({ package_name: comments.name })
      .delete();
    await fixture.close();
  });
  const base = "/settings/extension-registry";
  await fixture.call("GET", base, undefined, 401, null);
  await fixture.call("GET", base, undefined, 403, fixture.memberToken);
  await fixture.call("GET", `${base}/unknown`, undefined, 401, null);
  await fixture.call("GET", `${base}/unknown`, undefined, 404);
  const list = (await fixture.call("GET", base)).data;
  const entry = list.find(
    (item: { packageName: string }) => item.packageName === comments.name,
  );
  assert.ok(entry);
  assert.equal(entry.status, "healthy");
  assert.equal(entry.desiredState, "enabled");
  assert.equal(entry.actualState, "enabled");
  assert.equal(entry.pendingRestart, false);
  assert.ok(entry.instanceId);
  await fixture.call(
    "POST",
    `${base}/${entry.id}/disable`,
    undefined,
    403,
    fixture.memberToken,
  );
  const concurrent = await Promise.all([
    fixture.call("POST", `${base}/${entry.id}/disable`),
    fixture.call("POST", `${base}/${entry.id}/disable`),
  ]);
  assert.deepEqual(concurrent.map((response) => response.data.changed).sort(), [
    false,
    true,
  ]);
  const changed = concurrent.find((response) => response.data.changed)!.data;
  assert.equal(changed.status, "restart_required");
  assert.equal(changed.loaded, true);
  assert.equal(changed.desiredEnabled, false);
  assert.equal(changed.desiredState, "disabled");
  assert.equal(changed.actualState, "enabled");
  assert.equal(changed.pendingRestart, true);
  assert.equal(
    (await fixture.call("GET", `${base}/${entry.id}/history`)).data.length,
    1,
  );
  const repeated = (await fixture.call("POST", `${base}/${entry.id}/disable`))
    .data;
  assert.equal(repeated.changed, false);
  assert.equal(
    (await fixture.call("GET", `${base}/${entry.id}/history`)).data.length,
    1,
  );
  const enabled = (await fixture.call("POST", `${base}/${entry.id}/enable`))
    .data;
  assert.equal(enabled.status, "healthy");
  assert.equal(
    (await fixture.call("GET", `${base}/${entry.id}/history`)).data.length,
    2,
  );
  await Promise.all([
    fixture.call("POST", `${base}/${entry.id}/disable`),
    fixture.call("POST", `${base}/${entry.id}/enable`),
  ]);
  const desiredAfterRace = (await extensionStates(fixture.db)).get(
    comments.name,
  );
  const afterRaceHistory = (
    await fixture.call("GET", `${base}/${entry.id}/history`)
  ).data;
  assert.equal(desiredAfterRace, afterRaceHistory[0].action === "enable");
  if (!desiredAfterRace) {
    await fixture.call("POST", `${base}/${entry.id}/enable`);
  }
  const dependent = parseRegistryPackage(
    {
      name: "dependent",
      version: "1.0.0",
      asmblyr: {
        manifest: {
          version: 1,
          namespace: "dependent",
          dependencies: { [comments.name]: "*" },
        },
      },
    },
    "dependent",
  );
  await assert.rejects(
    setExtensionEnabled(
      fixture.db,
      [comments.registry!, dependent],
      comments.name,
      false,
      fixture.admin.id,
      "0.0.0",
    ),
    { statusCode: 409, code: "EXTENSION_DEPENDENCY_CONFLICT" },
  );
  const activity = (await fixture.call("GET", `${base}/${entry.id}/history`))
    .data;
  assert.equal(activity[0].result, "blocked");
  assert.equal(activity[0].error_code, "EXTENSION_DEPENDENCY_CONFLICT");
  await assert.rejects(
    setExtensionEnabled(
      fixture.db,
      [comments.registry!],
      "unknown",
      false,
      fixture.admin.id,
      "0.0.0",
    ),
    { statusCode: 404 },
  );
  await assert.rejects(
    setExtensionEnabled(
      fixture.db,
      [{ ...comments.registry!, validationIssue: "Unsupported manifest" }],
      comments.name,
      true,
      fixture.admin.id,
      "0.0.0",
    ),
    { statusCode: 409, code: "EXTENSION_MANIFEST_INVALID" },
  );
  const firstInstance = "00000000-0000-4000-8000-000000000001";
  const secondInstance = "00000000-0000-4000-8000-000000000002";
  await recordExtensionStartup(
    fixture.db,
    [comments.registry!],
    new Set([comments.name]),
    new Map(),
    firstInstance,
  );
  await recordExtensionStartup(
    fixture.db,
    [comments.registry!],
    new Set(),
    new Map([[comments.name, "Initialization failed"]]),
    secondInstance,
  );
  const runtimeHistory = (
    await fixture.call("GET", `${base}/${entry.id}/history`)
  ).data;
  assert.equal(runtimeHistory[0].instance_id, secondInstance);
  assert.equal(runtimeHistory[0].result, "failed");
  assert.equal(runtimeHistory[0].error_message, "Initialization failed");
  assert.equal(runtimeHistory[1].instance_id, firstInstance);
  assert.equal(runtimeHistory[1].result, "succeeded");

  await setExtensionEnabled(
    fixture.db,
    [comments.registry!],
    comments.name,
    false,
    fixture.admin.id,
    "0.0.0",
  );
  const afterRestart = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
    {
      disabledPackages: await disabledExtensionPackages(fixture.db),
    },
  );
  assert.ok(!afterRestart.some((plugin) => plugin.name === comments.name));
  const restarted = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    registryPackages: [comments.registry!],
    registryInstanceId: firstInstance,
  });
  const disabledResponse = await restarted.inject({
    method: "GET",
    url: `${base}/${entry.id}`,
    headers: { authorization: `Bearer ${fixture.adminToken}` },
  });
  assert.equal(disabledResponse.statusCode, 200);
  assert.equal(disabledResponse.json().data.desiredState, "disabled");
  assert.equal(disabledResponse.json().data.actualState, "disabled");
  assert.equal(disabledResponse.json().data.pendingRestart, false);
  await restarted.close();

  await setExtensionEnabled(
    fixture.db,
    [comments.registry!],
    comments.name,
    true,
    fixture.admin.id,
    "0.0.0",
  );
  const failed = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    registryPackages: [comments.registry!],
    registryFailures: new Map([[comments.name, "Initialization failed"]]),
    registryInstanceId: secondInstance,
  });
  const failedResponse = await failed.inject({
    method: "GET",
    url: `${base}/${entry.id}`,
    headers: { authorization: `Bearer ${fixture.adminToken}` },
  });
  assert.equal(failedResponse.statusCode, 200);
  assert.equal(failedResponse.json().data.desiredState, "enabled");
  assert.equal(failedResponse.json().data.actualState, "failed");
  assert.equal(failedResponse.json().data.lastError, "Initialization failed");
  assert.equal(failedResponse.json().data.instanceId, secondInstance);
  await failed.close();
});
