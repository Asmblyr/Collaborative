import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";

test("old public origins redirect only safe requests, preserving original API prefix and query without reading cookies", async (t) => {
  const app = createApp({
    logger: false,
    passkeys: {
      origin: "https://admin.example.test",
      rpId: "admin.example.test",
      rpName: "Test",
    },
    publicOriginAliases: ["http://legacy.example.test"],
  });
  t.after(() => app.close());
  for (const url of [
    "/extensions/example/page?selected=one&selected=two",
    "/api/users/me?fields=id",
    "//outside.test/path",
  ]) {
    const response = await app.inject({
      url,
      headers: {
        host: "legacy.example.test",
        cookie: "asmblyr_session=invalid",
      },
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, `https://admin.example.test${url}`);
    assert.equal(response.headers["set-cookie"], undefined);
    assert.equal(response.headers["cache-control"], "no-store");
  }
  const mutation = await app.inject({
    method: "POST",
    url: "/api/auth/browser/login",
    headers: { host: "legacy.example.test" },
    payload: { email: "person@example.test", password: "placeholder" },
  });
  assert.equal(mutation.statusCode, 421);
  assert.equal(mutation.headers.location, undefined);
  for (const host of [
    "admin.example.test",
    "core.internal",
    "legacy.example.test.evil",
  ]) {
    const response = await app.inject({
      url: "/api/health",
      headers: { host, "x-forwarded-host": "legacy.example.test" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.location, undefined);
  }
});

test("canonical aliases reject paths, credentials, non-HTTP schemes and redirect loops", () => {
  for (const alias of [
    "https://localhost:3000/path",
    "https://user:password@legacy.test",
    "javascript:alert(1)",
    "http://localhost:3000",
    "https://legacy.test?next=elsewhere",
  ]) {
    assert.throws(
      () => createApp({ logger: false, publicOriginAliases: [alias] }),
      alias,
    );
  }
});
