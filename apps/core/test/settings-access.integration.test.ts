import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { settingsSections, type SettingsSection } from "@asmblyr/contracts";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("settings grants are shared, isolated by section and revoked without a new token", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    plugins: [
      {
        name: "settings-test",
        namespace: "settingstest",
        definition: {},
        endpoints: [],
        capabilities: ["settings"],
        settings: {
          title: "Example",
          fields: {
            enabled: { type: "boolean", label: "Enabled", default: true },
          },
        },
      },
    ],
  });
  const ids: string[] = [];
  const policyIds: string[] = [];
  const resources: { serviceId?: string } = {};
  const collection = `settings_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  t.after(async () => {
    if (resources.serviceId) {
      await db("public.asmblyr_service_accounts")
        .where({ id: resources.serviceId })
        .delete();
    }
    await db("public.asmblyr_policies").whereIn("id", policyIds).delete();
    await db("public.asmblyr_security_events")
      .whereIn("actor_id", ids)
      .delete();
    await db("public.asmblyr_users").whereIn("id", ids).delete();
    await db.schema.dropTableIfExists(collection);
    await db("public.asmblyr_collections").where({ name: collection }).delete();
    await app.close();
    await db.destroy();
  });
  const users = await db("public.asmblyr_users")
    .insert([
      { email: `${randomUUID()}@example.test`, superuser: true },
      { email: `${randomUUID()}@example.test`, superuser: false },
    ])
    .returning<{ id: string }[]>("id");
  ids.push(...users.map((user) => user.id));
  const admin = {
    authorization: `Bearer ${(await issueUserTokens(db, ids[0])).accessToken}`,
  };
  const member = {
    authorization: `Bearer ${(await issueUserTokens(db, ids[1])).accessToken}`,
  };
  const grant = (section: SettingsSection) => ({
    section,
    action: "update",
    fields: ["*"],
  });
  const call = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    headers = member,
    payload?: object,
  ) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  const policy = async (permissions: object[], userIds: string[]) => {
    const result = await call("POST", "/policies", admin, {
      name: randomUUID(),
      permissions,
      userIds,
    });
    assert.equal(result.statusCode, 201, result.body);
    policyIds.push(result.json().data.id);
    return result.json().data.id as string;
  };

  assert.equal((await app.inject({ url: "/settings/access" })).statusCode, 401);
  assert.deepEqual(
    (await call("GET", "/settings/access")).json().data.sections,
    [],
  );
  assert.deepEqual(
    (await call("GET", "/settings/access", admin)).json().data.sections,
    settingsSections,
  );
  const paths: Record<SettingsSection, string> = {
    users: "/users",
    policies: "/policies",
    plugins: "/settings/plugins",
    assistant: "/settings/assistant",
    terms: "/settings/terms",
    services: "/service-accounts",
    oauth: "/oauth-apps/status",
    files: "/files",
  };
  for (const path of Object.values(paths)) {
    assert.equal((await call("GET", path)).statusCode, 403, path);
  }
  const first = await policy([grant("assistant")], [ids[1]]);
  const second = await policy([grant("assistant"), grant("plugins")], []);
  const firstDetail = (await call("GET", `/policies/${first}`, admin)).json()
    .data;
  const secondDetail = (await call("GET", `/policies/${second}`, admin)).json()
    .data;
  assert.equal(
    firstDetail.permissions[0].id,
    secondDetail.permissions.find(
      (p: { section: string }) => p.section === "assistant",
    ).id,
  );
  assert.deepEqual(
    (await call("GET", "/settings/access")).json().data.sections,
    ["assistant"],
  );
  assert.equal((await call("GET", paths.assistant)).statusCode, 200);
  assert.equal(
    (await call("GET", "/settings/assistant/telemetry")).statusCode,
    200,
  );
  for (const section of settingsSections.filter(
    (section) => section !== "assistant",
  )) {
    assert.equal((await call("GET", paths[section])).statusCode, 403, section);
  }
  assert.equal(
    (
      await call("PUT", "/settings/assistant", member, {
        enabled: false,
        reasoningEffort: null,
        thinking: null,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await call("PUT", "/settings/plugins/comments", member, {})).statusCode,
    403,
  );
  assert.equal(
    (await call("POST", "/policies", member, { name: "Escalate" })).statusCode,
    403,
  );
  assert.equal(
    (await call("POST", "/permissions", member, grant("policies"))).statusCode,
    403,
  );
  assert.equal(
    (await call("POST", "/users", member, { email: "blocked@example.test" }))
      .statusCode,
    403,
  );
  assert.equal(
    (await call("POST", "/service-accounts", member, { name: "Blocked" }))
      .statusCode,
    403,
  );
  assert.equal(
    (await call("POST", "/collections", member, { name: collection }))
      .statusCode,
    403,
  );
  assert.equal((await call("GET", "/settings/options/users")).statusCode, 403);
  assert.equal(
    (await call("GET", "/settings/options/policies")).statusCode,
    403,
  );
  assert.equal(
    (await call("GET", "/settings/options/collections")).statusCode,
    403,
  );

  assert.equal(
    (await call("PUT", `/policies/${second}/users/${ids[1]}`, admin))
      .statusCode,
    204,
  );
  await call("DELETE", `/policies/${first}/users/${ids[1]}`, admin);
  assert.deepEqual(
    (await call("GET", "/settings/access")).json().data.sections,
    ["plugins", "assistant"],
  );
  await call("PATCH", `/policies/${second}`, admin, {
    name: secondDetail.name,
    permissions: [grant("plugins")],
    userIds: [ids[1]],
  });
  assert.equal((await call("GET", paths.assistant)).statusCode, 403);
  assert.equal((await call("GET", paths.plugins)).statusCode, 200);

  const snapshot = (await call("GET", "/settings/plugins/settingstest")).json()
    .data;
  const savedSettings = await call(
    "PUT",
    "/settings/plugins/settingstest",
    member,
    { revision: snapshot.revision, values: { enabled: false } },
  );
  assert.equal(savedSettings.statusCode, 200, savedSettings.body);
  assert.equal(savedSettings.json().data.values.enabled, false);
  assert.equal(
    (await call("PUT", "/settings/assistant", member, { enabled: true }))
      .statusCode,
    403,
  );

  for (const invalid of [
    { section: "unknown", action: "update", fields: ["*"] },
    { section: "assistant", action: "create", fields: ["*"] },
    { section: "assistant", action: "update", fields: ["instructions"] },
    { ...grant("assistant"), collection },
  ]) {
    assert.equal(
      (await call("POST", "/permissions", admin, invalid)).statusCode,
      400,
    );
  }
  assert.equal(
    (
      await call("PATCH", `/policies/${second}`, admin, {
        name: "Rollback",
        permissions: [grant("assistant"), grant("assistant")],
        userIds: [ids[1]],
      })
    ).statusCode,
    400,
  );
  assert.deepEqual(
    (await call("GET", "/settings/access")).json().data.sections,
    ["plugins"],
  );

  // Every management section can be delegated independently, with live checks.
  for (const section of settingsSections) {
    const saved = await call("PATCH", `/policies/${second}`, admin, {
      name: secondDetail.name,
      permissions: [grant(section)],
      userIds: [ids[1]],
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(
      (await call("GET", "/settings/access")).json().data.sections,
      [section],
    );
    assert.equal((await call("GET", paths[section])).statusCode, 200, section);
    assert.equal(
      (await call("GET", "/settings/options/collections")).statusCode,
      section === "policies" ? 200 : 403,
    );
    if (section === "policies") {
      assert.equal((await call("GET", "/users")).statusCode, 200);
      assert.equal(
        (
          await call("POST", "/users", member, {
            email: "no-invite@example.test",
          })
        ).statusCode,
        403,
      );
    }
  }

  // Service identities do not inherit access to the human administration surface.
  const servicePolicy = await policy(settingsSections.map(grant), []);
  const account = await call("POST", "/service-accounts", admin, {
    name: "Settings isolation",
    policyIds: [servicePolicy],
  });
  assert.equal(account.statusCode, 201, account.body);
  resources.serviceId = account.json().data.id;
  const key = await call(
    "POST",
    `/service-accounts/${resources.serviceId}/keys`,
    admin,
    {
      name: "Test",
    },
  );
  const token = await call("POST", "/auth/service-token", admin, {
    key: key.json().data.secret,
  });
  const machine = { authorization: `Bearer ${token.json().accessToken}` };
  for (const path of ["/settings/access", ...Object.values(paths)]) {
    assert.equal((await call("GET", path, machine)).statusCode, 403, path);
  }
  await db("public.asmblyr_users")
    .where({ id: ids[1] })
    .update({ status: "disabled" });
  assert.equal((await call("GET", "/settings/access")).statusCode, 401);
});
