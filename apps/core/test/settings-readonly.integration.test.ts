import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { exportJWK, generateKeyPair } from "jose";
import {
  settingsSections,
  type SettingsSection,
} from "@asmblyr-collaborative/contracts";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("read-only settings allow inspection and reject every management mutation", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    oauth: {
      issuer: "http://localhost:3000/oauth",
      cookieKeys: [randomBytes(32).toString("base64url")],
      storageKey: randomBytes(32).toString("base64url"),
      jwks: {
        keys: [
          {
            ...(await exportJWK(privateKey)),
            kid: "readonly",
            alg: "RS256",
            use: "sig",
          },
        ],
      },
    },
    plugins: [
      {
        name: "readonly-test",
        namespace: "readonlytest",
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
  const users = [randomUUID(), randomUUID()];
  const policies: string[] = [];
  const resources: { serviceId?: string; applicationId?: string } = {};
  t.after(async () => {
    if (resources.serviceId) {
      await db("public.asmblyr_service_accounts")
        .where({ id: resources.serviceId })
        .delete();
    }
    if (resources.applicationId) {
      await db("public.asmblyr_oauth_apps")
        .where({ id: resources.applicationId })
        .delete();
    }
    await db("public.asmblyr_settings")
      .where({ key: "plugin:readonlytest" })
      .delete();
    await db("public.asmblyr_policies").whereIn("id", policies).delete();
    await db("public.asmblyr_security_events")
      .whereIn("actor_id", users)
      .delete();
    await db("public.asmblyr_users").whereIn("id", users).delete();
    await app.close();
    await db.destroy();
  });
  await db("public.asmblyr_users").insert(
    users.map((id, i) => ({
      id,
      email: `${id}@example.test`,
      superuser: i === 0,
    })),
  );
  const headers = await Promise.all(
    users.map(async (id) => ({
      authorization: `Bearer ${(await issueUserTokens(db, id)).accessToken}`,
    })),
  );
  const call = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    actor = 1,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: headers[actor],
      ...(payload ? { payload } : {}),
    });
  const grant = (
    section: SettingsSection,
    action: "read" | "update" = "read",
  ) => ({ section, action, fields: ["*"] });
  const createPolicy = async (permissions: object[], userIds: string[]) => {
    const result = await call("POST", "/policies", 0, {
      name: randomUUID(),
      permissions,
      userIds,
    });
    assert.equal(result.statusCode, 201, result.body);
    policies.push(result.json().data.id);
    return result.json().data.id as string;
  };
  const policyId = await createPolicy(
    settingsSections.map((section) => grant(section)),
    [users[1]],
  );
  const policy = (await call("GET", `/policies/${policyId}`, 0)).json().data;
  assert.ok(
    policy.permissions.every((p: { action: string }) => p.action === "read"),
  );
  const permissionId = policy.permissions[0].id;
  const serviceId = (
    await call("POST", "/service-accounts", 0, {
      name: "Read-only fixture",
      policyIds: [policyId],
    })
  ).json().data.id;
  resources.serviceId = serviceId;
  const createdKey = await call(
    "POST",
    `/service-accounts/${serviceId}/keys`,
    0,
    { name: "Fixture" },
  );
  const keyId = createdKey.json().data.id;
  const application = await call("POST", "/oauth-apps", 0, {
    name: "Read-only fixture",
    description: "",
    enabled: true,
    clientType: "confidential",
    redirectUris: ["http://localhost:4567/callback"],
    userIds: [],
    audience: "",
    scopes: [],
  });
  assert.equal(application.statusCode, 201, application.body);
  const applicationId = application.json().data.application.id;
  resources.applicationId = applicationId;
  const termId = (await call("GET", "/settings/terms", 0)).json().data[0].id;
  const snapshot = (
    await call("GET", "/settings/plugins/readonlytest", 0)
  ).json().data;
  const paths: Record<SettingsSection, string[]> = {
    users: ["/users", `/users/${users[1]}/access`],
    policies: [
      "/policies",
      `/policies/${policyId}`,
      "/permissions",
      `/permissions/${permissionId}`,
      "/settings/options/collections",
    ],
    plugins: ["/settings/plugins", "/settings/plugins/readonlytest"],
    assistant: ["/settings/assistant", "/settings/assistant/telemetry"],
    terms: ["/settings/terms"],
    services: ["/service-accounts", `/service-accounts/${serviceId}`],
    oauth: ["/oauth-apps/status", "/oauth-apps", "/settings/options/users"],
  };
  assert.deepEqual((await call("GET", "/settings/access")).json().data, {
    sections: settingsSections,
    editableSections: [],
    canManagePolicies: false,
    delegatablePolicyIds: [],
  });
  for (const url of [
    ...Object.values(paths).flat(),
    "/settings/options/policies",
  ]) {
    const result = await call("GET", url);
    assert.equal(result.statusCode, 200, `${url}: ${result.body}`);
  }
  const detail = (await call("GET", `/service-accounts/${serviceId}`)).json()
    .data;
  assert.equal(detail.keys[0].secret, undefined);
  assert.equal(detail.keys[0].key_hash, undefined);
  const apps = (await call("GET", "/oauth-apps")).json().data;
  assert.ok(
    apps.every(
      (value: object) => !("clientSecret" in value) && !("secret" in value),
    ),
  );
  const writes: ["POST" | "PUT" | "PATCH" | "DELETE", string, object?][] = [
    ["POST", "/users", { email: "blocked@example.test" }],
    ["POST", `/users/${users[1]}/invitation`, {}],
    ["POST", "/policies", { name: "Escalation" }],
    ["PATCH", `/policies/${policyId}`, { name: "Escalation" }],
    ["DELETE", `/policies/${policyId}`],
    ["PUT", `/policies/${policyId}/users/${users[1]}`],
    ["DELETE", `/policies/${policyId}/users/${users[1]}`],
    ["PUT", `/policies/${policyId}/permissions/${permissionId}`],
    ["DELETE", `/policies/${policyId}/permissions/${permissionId}`],
    ["POST", "/permissions", grant("policies", "update")],
    ["PATCH", `/permissions/${permissionId}`, { fields: ["*"] }],
    ["DELETE", `/permissions/${permissionId}`],
    ["PUT", "/settings/assistant", { enabled: false }],
    [
      "PUT",
      "/settings/plugins/readonlytest",
      { revision: snapshot.revision, values: { enabled: false } },
    ],
    ["POST", "/settings/terms", { name: "Blocked" }],
    ["PUT", `/settings/terms/${termId}`, { name: "Blocked" }],
    ["POST", "/service-accounts", { name: "Blocked" }],
    ["PUT", `/service-accounts/${serviceId}`, { name: "Blocked" }],
    ["POST", `/service-accounts/${serviceId}/keys`, { name: "Blocked" }],
    ["DELETE", `/service-accounts/${serviceId}/keys/${keyId}`],
    ["POST", `/service-accounts/${serviceId}/federations`, {}],
    ["DELETE", `/service-accounts/${serviceId}/federations/${randomUUID()}`],
    ["POST", "/oauth-apps", {}],
    ["PUT", `/oauth-apps/${applicationId}`, {}],
    ["POST", `/oauth-apps/${applicationId}/secret`, {}],
  ];
  for (const [method, url, payload] of writes) {
    const result = await call(method, url, 1, payload);
    assert.equal(result.statusCode, 403, `${method} ${url}: ${result.body}`);
  }
  assert.deepEqual(
    (await call("GET", "/settings/plugins/readonlytest")).json().data,
    snapshot,
  );
  assert.equal(
    (await call("GET", `/policies/${policyId}`)).json().data.name,
    policy.name,
  );
  assert.equal(
    (await call("GET", `/service-accounts/${serviceId}`)).json().data.keys[0]
      .revokedAt,
    null,
  );
  // Section reads remain isolated, including the intentionally limited selectors.
  for (const section of settingsSections) {
    const updated = await call("PATCH", `/policies/${policyId}`, 0, {
      name: policy.name,
      permissions: [grant(section)],
      userIds: [users[1]],
    });
    assert.equal(updated.statusCode, 200, updated.body);
    for (const [target, urls] of Object.entries(paths)) {
      for (const url of urls) {
        const allowed =
          target === section || (section === "policies" && url === "/users");
        assert.equal(
          (await call("GET", url)).statusCode,
          allowed ? 200 : 403,
          `${section}: ${url}`,
        );
      }
    }
  }
  // Distinct shared read/update permissions; highest grant wins and downgrades immediately.
  const writerId = await createPolicy([grant("plugins", "update")], [users[1]]);
  await call("PATCH", `/policies/${policyId}`, 0, {
    name: policy.name,
    permissions: [grant("plugins")],
    userIds: [users[1]],
  });
  assert.deepEqual((await call("GET", "/settings/access")).json().data, {
    sections: ["plugins"],
    editableSections: ["plugins"],
    canManagePolicies: false,
    delegatablePolicyIds: [],
  });
  const writer = (await call("GET", `/policies/${writerId}`, 0)).json().data;
  const reader = (await call("GET", `/policies/${policyId}`, 0)).json().data;
  assert.notEqual(writer.permissions[0].id, reader.permissions[0].id);
  const repeated = await call("POST", "/permissions", 0, grant("plugins"));
  assert.equal(repeated.json().data.id, reader.permissions[0].id);
  assert.equal(repeated.json().data.action, "read");
  await call("DELETE", `/policies/${writerId}/users/${users[1]}`, 0);
  assert.deepEqual((await call("GET", "/settings/access")).json().data, {
    sections: ["plugins"],
    editableSections: [],
    canManagePolicies: false,
    delegatablePolicyIds: [],
  });
  assert.equal(
    (
      await call("PUT", "/settings/plugins/readonlytest", 1, {
        revision: snapshot.revision,
        values: { enabled: false },
      })
    ).statusCode,
    403,
  );
  const access = (await call("GET", `/users/${users[1]}/access`, 0)).json()
    .data;
  assert.deepEqual(access.editableSections, []);
  const exchange = await call("POST", "/auth/service-token", 0, {
    key: createdKey.json().data.secret,
  });
  const machine = { authorization: `Bearer ${exchange.json().accessToken}` };
  for (const url of ["/settings/access", ...Object.values(paths).flat()]) {
    assert.equal(
      (await app.inject({ url, headers: machine })).statusCode,
      403,
      url,
    );
  }
});
