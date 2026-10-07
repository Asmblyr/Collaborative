import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { oauthFixture } from "./support/oauth-provider.js";

const monitor = "lavinmq.tag:monitoring";
const administrator = "lavinmq.tag:administrator";
const profile = "openid profile email";

test("application policies enforce personal roles throughout OAuth authorization", async (t) => {
  const f = await oauthFixture();
  const policyIds: string[] = [];
  const input = {
    ...f.input,
    policyManaged: true,
    scopes: [monitor, administrator],
    scopeLabels: { [monitor]: "Monitoring", [administrator]: "Administration" },
  };
  async function policy(scopes: string[], userIds = [f.users[0]]) {
    const result = await f.app.inject({
      method: "POST",
      url: "/policies",
      headers: f.auth,
      payload: {
        name: `OAuth policy ${randomUUID()}`,
        permissions: [],
        userIds,
        applications: [{ appId: f.application.id, scopes }],
      },
    });
    assert.equal(result.statusCode, 201, result.body);
    const id = result.json().data.id as string;
    policyIds.push(id);
    return id;
  }
  async function change(id: string, scopes: string[], userIds = [f.users[0]]) {
    return f.app.inject({
      method: "PATCH",
      url: `/policies/${id}`,
      headers: f.auth,
      payload: {
        name: `OAuth policy ${id}`,
        permissions: [],
        userIds,
        applications: [{ appId: f.application.id, scopes }],
      },
    });
  }
  async function authorize(headers = f.auth) {
    const flow = await f.flow(f.application.id, profile, headers);
    const response = await flow.consent();
    assert.equal(response.statusCode, 303, response.body);
    const code = new URL(String(response.headers.location)).searchParams.get(
      "code",
    );
    assert.ok(code, response.headers.location);
    return { flow, code };
  }
  async function roles(code: string, verifier: string) {
    const token = await f.exchange(code, verifier);
    assert.equal(token.statusCode, 200, token.body);
    const jwks = (await f.app.inject({ url: "/oauth/jwks" })).json();
    const { payload } = await jwtVerify(
      token.json().access_token,
      createLocalJWKSet(jwks),
      { issuer: f.config.issuer, audience: "lavinmq" },
    );
    assert.deepEqual(
      String(payload.scope).split(" ").sort(),
      profile.split(" ").sort(),
    );
    assert.equal(payload.superuser, undefined);
    return (payload.resource_access as Record<string, { roles: string[] }>)
      .lavinmq.roles;
  }
  try {
    assert.equal(f.application.policyManaged, false);
    const saved = await f.app.inject({
      method: "PUT",
      url: `/oauth-apps/${f.application.id}`,
      headers: f.auth,
      payload: input,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    await t.test(
      "catalog is restricted and a superuser without a policy cannot sign in",
      async () => {
        assert.equal(
          (await f.app.inject({ url: "/policies/applications" })).statusCode,
          401,
        );
        assert.equal(
          (
            await f.app.inject({
              url: "/policies/applications",
              headers: f.otherAuth,
            })
          ).statusCode,
          403,
        );
        const catalog = await f.app.inject({
          url: "/policies/applications",
          headers: f.auth,
        });
        assert.equal(catalog.json().data[0].scopeLabels[monitor], "Monitoring");
        const flow = await f.flow(f.application.id, profile);
        assert.equal(flow.details.json().data.allowed, false);
        assert.match(
          String((await flow.consent()).headers.location),
          /error=access_denied/,
        );
      },
    );
    const monitorPolicy = await policy([monitor]);
    const adminPolicy = await policy([administrator], [f.users[1]]);
    await t.test(
      "users receive only their own roles, independently of the common login request",
      async () => {
        const first = await authorize();
        assert.deepEqual(first.flow.details.json().data.servicePermissions, [
          { scope: monitor, name: "Monitoring" },
        ]);
        assert.deepEqual(await roles(first.code, first.flow.verifier), [
          monitor,
        ]);
        const second = await authorize(f.otherAuth);
        assert.deepEqual(await roles(second.code, second.flow.verifier), [
          administrator,
        ]);
        const forged = new URLSearchParams(first.flow.query);
        forged.set("scope", `${profile} ${administrator}`);
        const rejected = await f.app.inject({ url: `/oauth/auth?${forged}` });
        assert.match(String(rejected.headers.location), /error=invalid_scope/);
      },
    );
    await t.test(
      "policy editing rejects foreign scopes and non-administrators atomically",
      async () => {
        const denied = await f.app.inject({
          method: "PATCH",
          url: `/policies/${monitorPolicy}`,
          headers: f.otherAuth,
          payload: { name: "Changed" },
        });
        assert.equal(denied.statusCode, 403);
        assert.equal(
          (await change(monitorPolicy, ["another-service.admin"])).statusCode,
          400,
        );
        const current = await f.app.inject({
          url: `/policies/${monitorPolicy}`,
          headers: f.auth,
        });
        assert.deepEqual(current.json().data.applications, [
          { appId: f.application.id, scopes: [monitor] },
        ]);
      },
    );
    await t.test(
      "pending codes cannot acquire newly granted roles and new grants need consent",
      async () => {
        const pending = await authorize();
        const staleScreen = await f.flow(f.application.id, profile);
        assert.equal(
          (await change(monitorPolicy, [monitor, administrator])).statusCode,
          200,
        );
        assert.equal((await staleScreen.decision()).statusCode, 409);
        assert.deepEqual(await roles(pending.code, pending.flow.verifier), [
          monitor,
        ]);
        const fresh = await f.flow(f.application.id, profile);
        assert.equal(fresh.details.json().data.canReuseConsent, false);
        assert.equal(
          (await fresh.decision(true, { reuse: true })).statusCode,
          409,
        );
        const accepted = await fresh.consent();
        const code = new URL(
          String(accepted.headers.location),
        ).searchParams.get("code")!;
        assert.deepEqual(await roles(code, fresh.verifier), [
          administrator,
          monitor,
        ]);
      },
    );
    await t.test(
      "removing permissions before code exchange reduces the resulting token",
      async () => {
        const pending = await authorize();
        assert.equal((await change(monitorPolicy, [monitor])).statusCode, 200);
        assert.deepEqual(await roles(pending.code, pending.flow.verifier), [
          monitor,
        ]);
      },
    );
    await t.test(
      "policies combine; removing the last assignment rejects a pending token",
      async () => {
        assert.equal(
          (await change(adminPolicy, [administrator], f.users)).statusCode,
          200,
        );
        const combined = await authorize();
        assert.deepEqual(await roles(combined.code, combined.flow.verifier), [
          administrator,
          monitor,
        ]);
        const pending = await authorize();
        await change(monitorPolicy, [monitor], []);
        await change(adminPolicy, [administrator], [f.users[1]]);
        const rejected = await f.exchange(pending.code, pending.flow.verifier);
        assert.notEqual(rejected.statusCode, 200);
      },
    );
    await t.test(
      "legacy edits preserve policy management and omitted application grants",
      async () => {
        const saved = await f.app.inject({
          method: "PUT",
          url: `/oauth-apps/${f.application.id}`,
          headers: f.auth,
          payload: { ...f.input, scopes: input.scopes },
        });
        assert.equal(saved.json().data.application.policyManaged, true);
        const edited = await f.app.inject({
          method: "PATCH",
          url: `/policies/${adminPolicy}`,
          headers: f.auth,
          payload: {
            name: "Legacy edit",
            permissions: [],
            userIds: [f.users[1]],
          },
        });
        assert.equal(edited.statusCode, 200, edited.body);
        const detail = (
          await f.app.inject({
            url: `/policies/${adminPolicy}`,
            headers: f.auth,
          })
        ).json().data;
        assert.deepEqual(detail.applications, [
          { appId: f.application.id, scopes: [administrator] },
        ]);
      },
    );
    await t.test(
      "catalog removal removes grants permanently, and disabled mode hides the application",
      async () => {
        await f.app.inject({
          method: "PUT",
          url: `/oauth-apps/${f.application.id}`,
          headers: f.auth,
          payload: { ...input, scopes: [monitor], scopeLabels: {} },
        });
        await f.app.inject({
          method: "PUT",
          url: `/oauth-apps/${f.application.id}`,
          headers: f.auth,
          payload: input,
        });
        const current = (
          await f.app.inject({
            url: `/policies/${adminPolicy}`,
            headers: f.auth,
          })
        ).json().data;
        assert.deepEqual(current.applications[0].scopes, []);
        await f.app.inject({
          method: "PUT",
          url: `/oauth-apps/${f.application.id}`,
          headers: f.auth,
          payload: { ...input, policyManaged: false },
        });
        const catalog = (
          await f.app.inject({ url: "/policies/applications", headers: f.auth })
        ).json().data;
        assert.equal(
          catalog.some((app: { id: string }) => app.id === f.application.id),
          false,
        );
      },
    );
  } finally {
    await f.db("public.asmblyr_policies").whereIn("id", policyIds).delete();
    await f.close();
  }
});
