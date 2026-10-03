import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { exchangeFederation } from "../src/services/federation-exchange.js";
import { secretHash } from "../src/services/repository.js";

test("GitLab federation validates signed context, replay and lifecycle", async () => {
  assert.ok(process.env.DATABASE_URL);
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const [admin] = await db("asmblyr_users").insert({ email: `${randomUUID()}@example.test`, superuser: true }).returning("id");
  const headers = { authorization: `Bearer ${(await issueUserTokens(db, admin.id)).accessToken}` };
  const pair = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: "test" }] });
  const replayHashes: string[] = [];
  let serviceId = "";
  async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, status = 200) {
    const res = await app.inject({ method, url, headers, payload });
    assert.equal(res.statusCode, status, `${method} ${url}: ${res.body}`);
    return res;
  }
  try {
    serviceId = (await call("POST", "/service-accounts", { name: "Federation fixture" }, 201)).json().data.id;
    const path = `/service-accounts/${serviceId}/federations`;
    const binding = (await call("POST", path, { name: "CI", projectId: "123", projectPath: "asmblyr/test", ref: "main" }, 201)).json().data;
    async function sign(overrides: Record<string, unknown> = {}, signingKey = pair.privateKey) {
      const now = Math.floor(Date.now() / 1000), jti = randomUUID();
      replayHashes.push(secretHash(jti));
      return new SignJWT({ iss: "https://gitlab.com", aud: binding.audience,
        sub: "project_path:asmblyr/test:ref_type:branch:ref:main", iat: now, nbf: now, exp: now + 300, jti,
        project_id: "123", job_project_id: "123", project_path: "asmblyr/test", job_project_path: "asmblyr/test",
        ref: "main", ref_type: "branch", ref_protected: "true", pipeline_source: "push", ...overrides })
        .setProtectedHeader({ alg: "RS256", kid: "test" }).sign(signingKey);
    }
    const exchange = (assertion: string) => exchangeFederation(db, { federationId: binding.id, assertion }, keys);
    const assertion = await sign();
    const results = await Promise.allSettled([exchange(assertion), exchange(assertion)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const issued = results.find((r) => r.status === "fulfilled")!;
    assert.equal(issued.status, "fulfilled");
    const token = issued.value.accessToken;
    assert.ok(issued.value.expiresIn <= 300 && issued.value.expiresIn > 0);
    assert.equal("refreshToken" in issued.value, false);
    async function access(token: string, status: number) {
      const res = await app.inject({ url: "/collections", headers: { authorization: `Bearer ${token}` } });
      assert.equal(res.statusCode, status);
      if (status === 200) assert.deepEqual(res.json().data, []);
    }
    await access(token, 200);
    const badClaims = [{ aud: "other" }, { iss: "https://evil.example" }, { sub: "other" },
      { project_id: "456" }, { job_project_id: "456" }, { project_path: "other/test" },
      { job_project_path: "fork/test" }, { ref: "dev" }, { ref_type: "tag" }, { ref_protected: "false" },
      { pipeline_source: "merge_request_event" }, { exp: 1 }, { nbf: 9999999999 }, { jti: "" }, { exp: undefined }];
    for (const claims of badClaims) await assert.rejects(exchange(await sign(claims)), { statusCode: 401 });
    const wrong = await generateKeyPair("RS256");
    await assert.rejects(exchange(await sign({}, wrong.privateKey)), { statusCode: 401 });
    const invalid = await app.inject({ method: "POST", url: "/auth/federation-token", payload: { federationId: "z".repeat(36), assertion: "bad" } });
    assert.equal(invalid.statusCode, 401);
    await call("PUT", `/service-accounts/${serviceId}`, { name: "Federation fixture", status: "disabled" });
    await access(token, 401); await assert.rejects(exchange(await sign()), { statusCode: 401 });
    await call("PUT", `/service-accounts/${serviceId}`, { name: "Federation fixture" });
    await access(token, 401);
    const fresh = await exchange(await sign());
    await access(fresh.accessToken, 200);
    await call("DELETE", `${path}/${binding.id}`, undefined, 204);
    await access(fresh.accessToken, 401); await assert.rejects(exchange(await sign()), { statusCode: 401 });
    const audit = await db("asmblyr_security_events").where({ subject_id: serviceId });
    assert.ok(audit.some((r) => r.action === "service.federation_revoked"));
    assert.ok(!JSON.stringify(audit).includes(assertion));
  } finally {
    await db("asmblyr_federation_assertions").whereIn("jti_hash", replayHashes).delete();
    if (serviceId) await db("asmblyr_service_accounts").where({ id: serviceId }).delete();
    await db("asmblyr_security_events").where({ actor_id: admin.id }).delete();
    await db("asmblyr_users").where({ id: admin.id }).delete();
    await app.close(); await db.destroy();
  }
});
