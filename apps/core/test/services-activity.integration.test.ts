import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authenticatePrincipal } from "../src/auth/principal.js";
import { secretHash, serviceSecret } from "../src/services/repository.js";

test("service key activity counts authenticated HTTP requests exactly", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const peer = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  const [admin] = await db("asmblyr_users")
    .insert({
      email: `${randomUUID()}@example.test`,
      superuser: true,
    })
    .returning("id");
  const headers = {
    authorization: `Bearer ${(await issueUserTokens(db, admin.id)).accessToken}`,
  };
  let serviceId = "";
  t.after(async () => {
    await app.close();
    await peer.close();
    await db("asmblyr_security_events").where({ actor_id: admin.id }).delete();
    await db("asmblyr_service_accounts").where({ id: serviceId }).delete();
    await db("asmblyr_users").where({ id: admin.id }).delete();
    await db.destroy();
  });

  // Some plugin paths can validate the same credential more than once.
  app.get("/test/service-activity", async (request) => {
    await Promise.all([
      authenticatePrincipal(db, request.headers.authorization),
      authenticatePrincipal(db, request.headers.authorization),
    ]);
    return { ok: true };
  });
  async function createKey(name: string) {
    const result = await app.inject({
      method: "POST",
      url: `/service-accounts/${serviceId}/keys`,
      headers,
      payload: { name },
    });
    assert.equal(result.statusCode, 201, result.body);
    return result.json().data;
  }
  async function exchange(secret: string) {
    const result = await app.inject({
      method: "POST",
      url: "/auth/service-token",
      payload: { key: secret },
    });
    assert.equal(result.statusCode, 200, result.body);
    return result.json().accessToken as string;
  }
  async function request(
    token: string,
    url = "/schema",
    target = app,
    status = 200,
  ) {
    const result = await target.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(result.statusCode, status, result.body);
  }
  async function metadata(id: string) {
    const result = await app.inject({
      method: "GET",
      url: `/service-accounts/${serviceId}`,
      headers,
    });
    assert.equal(result.statusCode, 200, result.body);
    assert.ok(!result.body.includes("key_hash"));
    return result.json().data.keys.find((key: { id: string }) => key.id === id);
  }
  const account = await app.inject({
    method: "POST",
    url: "/service-accounts",
    headers,
    payload: { name: "Activity test" },
  });
  assert.equal(account.statusCode, 201, account.body);
  serviceId = account.json().data.id;
  const first = await createKey("first");
  const second = await createKey("second");
  const token = await exchange(first.secret);
  const otherToken = await exchange(second.secret);

  await t.test(
    "release, exchange and last activity remain separate from request count",
    async () => {
      assert.equal(first.requestCount, "0");
      assert.equal(first.lastActivityAt, null);
      assert.equal(first.lastUsedAt, null);
      assert.ok(Number.isFinite(Date.parse(first.createdAt)));
      const exchanged = await metadata(first.id);
      assert.equal(exchanged.requestCount, "0");
      assert.ok(exchanged.lastUsedAt);
      assert.ok(exchanged.lastActivityAt);
      await request(token, "/health");
      assert.equal((await metadata(first.id)).requestCount, "0");
      await request(token, "/test/service-activity");
      await request(token, "/settings/access", app, 403);
      const active = await metadata(first.id);
      assert.equal(active.requestCount, "2");
      assert.equal(active.lastUsedAt, exchanged.lastUsedAt);
      assert.ok(
        Date.parse(active.lastActivityAt) >=
          Date.parse(exchanged.lastActivityAt),
      );
      assert.ok(!JSON.stringify(active).includes(first.secret));
      assert.equal((await metadata(second.id)).requestCount, "0");
    },
  );

  await t.test(
    "parallel calls and multiple replicas preserve exact bigint counts",
    async () => {
      await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          request(token, "/schema", index % 2 ? peer : app),
        ),
      );
      assert.equal((await metadata(first.id)).requestCount, "18");
      await request(otherToken);
      assert.equal((await metadata(second.id)).requestCount, "1");
      await db("asmblyr_service_keys")
        .where({ id: first.id })
        .update({ request_count: "9007199254740993" });
      await request(token);
      assert.equal((await metadata(first.id)).requestCount, "9007199254740994");
    },
  );

  await t.test(
    "invalid, expired, revoked and disabled credentials cannot record activity",
    async () => {
      const before = await metadata(second.id);
      await request(serviceSecret("asm_st_"), "/schema", app, 401);
      await db("asmblyr_service_tokens")
        .where({ token_hash: secretHash(otherToken) })
        .update({ expires_at: new Date(0) });
      await request(otherToken, "/schema", app, 401);
      const liveToken = await exchange(second.secret);
      const afterExchange = await metadata(second.id);
      assert.equal(afterExchange.requestCount, before.requestCount);
      await db("asmblyr_service_keys")
        .where({ id: second.id })
        .update({ expires_at: new Date(0) });
      await request(liveToken, "/schema", app, 401);
      await db("asmblyr_service_keys")
        .where({ id: second.id })
        .update({ expires_at: new Date(second.expiresAt) });
      await db("asmblyr_service_accounts")
        .where({ id: serviceId })
        .update({ status: "disabled" });
      await request(liveToken, "/schema", app, 401);
      await db("asmblyr_service_accounts")
        .where({ id: serviceId })
        .update({ status: "active" });
      const revoked = await app.inject({
        method: "DELETE",
        url: `/service-accounts/${serviceId}/keys/${second.id}`,
        headers,
      });
      assert.equal(revoked.statusCode, 204);
      await request(liveToken, "/schema", app, 401);
      const invalidExchange = await app.inject({
        method: "POST",
        url: "/auth/service-token",
        payload: { key: second.secret },
      });
      assert.equal(invalidExchange.statusCode, 401);
      const after = await metadata(second.id);
      assert.equal(after.requestCount, before.requestCount);
      assert.equal(after.lastActivityAt, afterExchange.lastActivityAt);
    },
  );

  await t.test(
    "federated tokens are not attributed to an unrelated service key",
    async () => {
      const binding = await app.inject({
        method: "POST",
        url: `/service-accounts/${serviceId}/federations`,
        headers,
        payload: {
          name: "CI",
          projectId: "123",
          projectPath: "asmblyr/test",
          ref: "main",
        },
      });
      assert.equal(binding.statusCode, 201, binding.body);
      const federatedToken = serviceSecret("asm_st_");
      await db("asmblyr_service_tokens").insert({
        token_hash: secretHash(federatedToken),
        federation_id: binding.json().data.id,
        expires_at: new Date(Date.now() + 60000),
      });
      const before = await metadata(first.id);
      await request(federatedToken);
      assert.deepEqual(await metadata(first.id), before);
    },
  );

  await t.test(
    "migration preserves old dates and refuses to discard recorded statistics",
    async () => {
      const require = createRequire(import.meta.url);
      const migration = require("../migrations/20261004120000_service_key_activity.cjs");
      await assert.rejects(
        db.transaction((trx) => migration.down(trx)),
        /service key activity/,
      );
      const before = await metadata(first.id);
      const rollback = new Error("rollback migration verification");
      await assert.rejects(
        db.transaction(async (trx) => {
          await trx("asmblyr_service_keys").update({
            request_count: 0,
            last_activity_at: trx.ref("last_used_at"),
          });
          await migration.down(trx);
          assert.equal(
            await trx.schema.hasColumn("asmblyr_service_keys", "request_count"),
            false,
          );
          await migration.up(trx);
          const row = await trx("asmblyr_service_keys")
            .where({ id: first.id })
            .first();
          assert.equal(row.request_count, "0");
          assert.equal(
            row.last_activity_at.toISOString(),
            row.last_used_at.toISOString(),
          );
          throw rollback;
        }),
        (error) => error === rollback,
      );
      assert.deepEqual(await metadata(first.id), before);
    },
  );
});
