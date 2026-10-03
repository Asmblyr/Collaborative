import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { secretHash } from "../src/services/repository.js";

test("service credentials, policies, audit and revocation", async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const suffix = randomUUID().slice(0, 8);
  const name = `test_service_${suffix}`;
  const [admin, human] = await db("asmblyr_users")
    .insert([
      { email: `service-admin-${suffix}@example.test`, superuser: true },
      { email: `service-user-${suffix}@example.test`, superuser: false },
    ])
    .returning("id");
  const adminToken = (await issueUserTokens(db, admin.id)).accessToken;
  const humanToken = (await issueUserTokens(db, human.id)).accessToken;
  let serviceId = "",
    policyId = "",
    otherId = "";
  async function call(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    token: string | null,
    payload?: object,
    status = 200,
  ) {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    assert.equal(
      response.statusCode,
      status,
      `${method} ${url}: ${response.statusCode}`,
    );
    return response;
  }
  async function exchange(key: string, status = 200) {
    const response = await call(
      "POST",
      "/auth/service-token",
      null,
      { key },
      status,
    );
    assert.equal(response.headers["cache-control"], "no-store");
    return response.json();
  }
  try {
    await call(
      "POST",
      "/collections",
      adminToken,
      {
        name,
        fields: [
          { name: "title", type: "text" },
          { name: "secret", type: "text" },
        ],
      },
      201,
    );
    serviceId = (
      await call(
        "POST",
        "/service-accounts",
        adminToken,
        { name: "Test worker" },
        201,
      )
    ).json().data.id;
    otherId = (
      await call(
        "POST",
        "/service-accounts",
        adminToken,
        { name: "Other worker" },
        201,
      )
    ).json().data.id;
    const key = (
      await call(
        "POST",
        `/service-accounts/${serviceId}/keys`,
        adminToken,
        { name: "first", expiresInDays: 7 },
        201,
      )
    ).json().data;
    const key2 = (
      await call(
        "POST",
        `/service-accounts/${serviceId}/keys`,
        adminToken,
        { name: "rotation" },
        201,
      )
    ).json().data;
    const grant = await exchange(key.secret);
    const token = grant.accessToken;
    await t.test(
      "keys are one-time hashed credentials, access is denied by default",
      async () => {
        assert.equal(grant.refreshToken, undefined);
        assert.equal(grant.expiresIn, 900);
        const stored = await db("asmblyr_service_keys")
          .where({ id: key.id })
          .first();
        assert.equal(stored.key_hash, secretHash(key.secret));
        assert.ok(!JSON.stringify(stored).includes(key.secret));
        const detail = (
          await call("GET", `/service-accounts/${serviceId}`, adminToken)
        ).json().data;
        assert.ok(!JSON.stringify(detail).includes(key.secret));
        assert.ok(!JSON.stringify(detail).includes("key_hash"));
        assert.ok(detail.keys[0].id);
        await call("GET", `/items/${name}`, token, undefined, 403);
        await call("GET", "/collections", key.secret, undefined, 401);
        await call("GET", "/service-accounts", humanToken, undefined, 403);
        for (const path of ["/users/me", "/auth/me"]) {
          await call("GET", path, token, undefined, 401);
        }
        for (const path of ["/service-accounts", "/policies"]) {
          await call("GET", path, token, undefined, 403);
        }
        await call("POST", "/auth/refresh", null, { refreshToken: token }, 400);
        await call(
          "DELETE",
          `/service-accounts/${otherId}/keys/${key.id}`,
          adminToken,
          undefined,
          404,
        );
        await call(
          "POST",
          `/service-accounts/${serviceId}/keys`,
          adminToken,
          { name: "invalid", expiresInDays: 366 },
          400,
        );
      },
    );
    policyId = (
      await call(
        "POST",
        "/policies",
        adminToken,
        { name: `Service ${suffix}` },
        201,
      )
    ).json().data.id;
    for (const action of ["read", "create", "update"]) {
      const permission = (
        await call(
          "POST",
          "/permissions",
          adminToken,
          { collection: name, action, fields: ["title"] },
          201,
        )
      ).json().data;
      await call(
        "PUT",
        `/policies/${policyId}/permissions/${permission.id}`,
        adminToken,
        undefined,
        204,
      );
    }
    await call("PUT", `/service-accounts/${serviceId}`, adminToken, {
      name: "Test worker",
      policyIds: [policyId],
    });
    await t.test(
      "service uses live collection and field grants and records a service actor",
      async () => {
        await call(
          "POST",
          `/items/${name}`,
          token,
          { title: "allowed", secret: "hidden" },
          403,
        );
        const item = (
          await call("POST", `/items/${name}`, token, { title: "allowed" }, 201)
        ).json().data;
        await call("PATCH", `/items/${name}/${item.id}`, token, {
          title: "updated",
        });
        const rows = (await call("GET", `/items/${name}`, token)).json().data;
        assert.equal(rows[0].title, "updated");
        assert.equal(rows[0].secret, undefined);
        await call(
          "DELETE",
          `/items/${name}/${item.id}`,
          token,
          undefined,
          403,
        );
        const events = await db("asmblyr_item_events")
          .where({ actor_id: serviceId })
          .select("actor_kind", "action");
        assert.equal(events.length, 2);
        assert.ok(events.every((event) => event.actor_kind === "service"));
        await call("GET", `/filter-presets/${name}`, token, undefined, 403);
        await call(
          "POST",
          "/collections",
          token,
          { name: `forbidden_${suffix}` },
          401,
        );
        await call("PUT", `/service-accounts/${serviceId}`, adminToken, {
          name: "Test worker",
          policyIds: [],
        });
        await call("GET", `/items/${name}`, token, undefined, 403);
        await call("PUT", `/service-accounts/${serviceId}`, adminToken, {
          name: "Test worker",
          policyIds: [policyId],
        });
      },
    );
    await t.test(
      "revocation, disable and expiration invalidate issued tokens immediately",
      async () => {
        const second = (await exchange(key2.secret)).accessToken;
        await call(
          "DELETE",
          `/service-accounts/${serviceId}/keys/${key.id}`,
          adminToken,
          undefined,
          204,
        );
        await exchange(key.secret, 401);
        await call("GET", `/items/${name}`, token, undefined, 401);
        await call("GET", `/items/${name}`, second);
        await call("PUT", `/service-accounts/${serviceId}`, adminToken, {
          name: "Test worker",
          status: "disabled",
          policyIds: [policyId],
        });
        await exchange(key2.secret, 401);
        await call("GET", `/items/${name}`, second, undefined, 401);
        await call("PUT", `/service-accounts/${serviceId}`, adminToken, {
          name: "Test worker",
          policyIds: [policyId],
        });
        await call("GET", `/items/${name}`, second, undefined, 401);
        const renewed = (await exchange(key2.secret)).accessToken;
        await db("asmblyr_service_tokens")
          .where({ token_hash: secretHash(renewed) })
          .update({ expires_at: new Date(0) });
        await call("GET", `/items/${name}`, renewed, undefined, 401);
        const beforeExpiry = (await exchange(key2.secret)).accessToken;
        await db("asmblyr_service_keys")
          .where({ id: key2.id })
          .update({ expires_at: new Date(0) });
        await exchange(key2.secret, 401);
        await call("GET", `/items/${name}`, beforeExpiry, undefined, 401);
        const history = await db("asmblyr_security_events").where({
          subject_id: serviceId,
        });
        assert.ok(history.some((row) => row.action === "service.key_revoked"));
        assert.ok(!JSON.stringify(history).includes(key.secret));
      },
    );
    await t.test(
      "exchange endpoint rate limits repeated invalid requests",
      async () => {
        let limited = false;
        for (let i = 0; i < 65; i++) {
          const response = await app.inject({
            method: "POST",
            url: "/auth/service-token",
            payload: { key: "invalid" },
            remoteAddress: "192.0.2.10",
          });
          if (response.statusCode === 429) {
            limited = true;
            assert.ok(response.headers["retry-after"]);
            break;
          }
          assert.equal(response.statusCode, 401);
        }
        assert.ok(limited);
      },
    );
  } finally {
    await db("asmblyr_security_events")
      .whereIn("actor_id", [admin.id, human.id])
      .delete();
    await db("asmblyr_service_accounts")
      .whereIn("id", [serviceId, otherId].filter(Boolean))
      .delete();
    if (policyId) {
      await db("asmblyr_policies").where({ id: policyId }).delete();
    }
    await db("asmblyr_item_events").where({ collection_name: name }).delete();
    await db.schema.withSchema("public").dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    await db("asmblyr_users").whereIn("id", [admin.id, human.id]).delete();
    await app.close();
    await db.destroy();
  }
});
