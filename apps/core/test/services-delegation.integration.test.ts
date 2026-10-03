import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { delegationFixture } from "./support/delegation-fixture.js";

test("delegated service managers cannot issue credentials or alter accounts outside their policy set", async (t) => {
  const f = await delegationFixture(t);
  const { call, ready, blocked, userIds } = f;
  await f.allow([ready]);
  const allowed = await f.service([ready], 1);
  const protectedId = await f.service([ready, blocked]);
  const key = await call("POST", `/service-accounts/${protectedId}/keys`, 0, {
    name: "protected",
  });
  assert.equal(key.statusCode, 201, key.body);
  const keyId = key.json().data.id;
  const binding = {
    name: "CI",
    projectId: "42",
    projectPath: "example/repo",
    ref: "main",
  };
  const federation = await call(
    "POST",
    `/service-accounts/${protectedId}/federations`,
    0,
    binding,
  );
  assert.equal(federation.statusCode, 201, federation.body);
  const federationId = federation.json().data.id;
  const before = (await call("GET", `/service-accounts/${protectedId}`)).json()
    .data;
  const count = await f.db("public.asmblyr_service_accounts").count("*");
  for (const [method, url, payload] of [
    [
      "POST",
      "/service-accounts",
      { name: "Escalate", policyIds: [ready, blocked] },
    ],
    [
      "PUT",
      `/service-accounts/${allowed}`,
      { name: "Escalate", policyIds: [ready, blocked] },
    ],
    [
      "PUT",
      `/service-accounts/${protectedId}`,
      { name: "Strip protected policies", policyIds: [] },
    ],
    ["POST", `/service-accounts/${protectedId}/keys`, { name: "Escalate" }],
    ["DELETE", `/service-accounts/${protectedId}/keys/${keyId}`, undefined],
    ["POST", `/service-accounts/${protectedId}/federations`, binding],
    [
      "DELETE",
      `/service-accounts/${protectedId}/federations/${federationId}`,
      undefined,
    ],
  ] as const) {
    const response = await call(method, url, 1, payload);
    assert.equal(
      response.statusCode,
      403,
      `${method} ${url}: ${response.body}`,
    );
  }
  assert.deepEqual(
    (await call("GET", `/service-accounts/${protectedId}`)).json().data,
    before,
  );
  assert.deepEqual(
    await f.db("public.asmblyr_service_accounts").count("*"),
    count,
  );
  const issued = await call("POST", `/service-accounts/${allowed}/keys`, 1, {
    name: "Allowed",
  });
  assert.equal(issued.statusCode, 201, issued.body);
  assert.equal(
    (
      await call(
        "DELETE",
        `/service-accounts/${allowed}/keys/${issued.json().data.id}`,
      )
    ).statusCode,
    204,
  );
  const allowedBinding = await call(
    "POST",
    `/service-accounts/${allowed}/federations`,
    1,
    binding,
  );
  assert.equal(allowedBinding.statusCode, 201, allowedBinding.body);
  assert.equal(
    (
      await call(
        "DELETE",
        `/service-accounts/${allowed}/federations/${allowedBinding.json().data.id}`,
      )
    ).statusCode,
    204,
  );
  assert.equal(
    (
      await call("PUT", `/service-accounts/${allowed}`, 1, {
        name: "Updated",
        policyIds: [ready],
      })
    ).statusCode,
    200,
  );
  await f.allow([]);
  assert.equal(
    (
      await call("POST", `/service-accounts/${allowed}/keys`, 1, {
        name: "After revoke",
      })
    ).statusCode,
    403,
  );
  await f.allow([ready]);
  await call("PUT", `/service-accounts/${allowed}`, 0, {
    name: "Admin expanded",
    policyIds: [ready, blocked],
  });
  assert.equal(
    (
      await call("POST", `/service-accounts/${allowed}/keys`, 1, {
        name: "After expansion",
      })
    ).statusCode,
    403,
  );
  const token = await call("POST", "/auth/service-token", 0, {
    key: key.json().data.secret,
  });
  assert.equal(token.statusCode, 200, token.body);
  const machine = { authorization: `Bearer ${token.json().accessToken}` };
  for (const url of [
    `/users/${userIds[1]}/delegation`,
    `/policies/${ready}/users`,
  ]) {
    assert.equal(
      (
        await f.app.inject({
          method: "PUT",
          url,
          headers: machine,
          payload: { policyIds: [], userIds: [] },
        })
      ).statusCode,
      403,
    );
  }
});
