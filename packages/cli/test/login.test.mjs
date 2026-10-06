import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { browserLogin } from "../src/login.mjs";

test("browser login resolves a UI root, binds PKCE, ignores invalid state and keeps credentials in memory", async () => {
  const output = [];
  const code = "c".repeat(43);
  const token = `asm_sc_${"t".repeat(43)}`;
  let challenge;
  let exchanged = false;
  let navigation;
  const result = await browserLogin("https://example.test", {
    out: (value) => output.push(value),
    timeoutMs: 1000,
    fetch: async (url, init) => {
      assert.equal(init.redirect, "error");
      if (url === "https://example.test/auth/cli/config")
        return new Response(null, { status: 404 });
      if (url === "https://example.test/api/auth/cli/config")
        return Response.json({
          data: { authorizationUrl: "https://example.test/sdk/connect" },
        });
      assert.equal(url, "https://example.test/api/auth/cli/token");
      const body = JSON.parse(init.body);
      assert.equal(body.code, code);
      assert.equal(
        createHash("sha256").update(body.verifier).digest("base64url"),
        challenge,
      );
      assert.match(body.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      exchanged = true;
      return Response.json({
        data: { accessToken: token, scope: "schema:read", expiresIn: 600 },
      });
    },
    openBrowser: async (url) => {
      navigation = (async () => {
        const approval = new URL(url);
        challenge = approval.searchParams.get("challenge");
        const callback = new URL(approval.searchParams.get("redirectUri"));
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", "bad");
        assert.equal((await fetch(callback)).status, 400);
        callback.searchParams.set("state", "я".repeat(43));
        assert.equal((await fetch(callback)).status, 400);
        callback.searchParams.set("state", approval.searchParams.get("state"));
        const complete = await fetch(callback, { redirect: "manual" });
        assert.equal(complete.status, 303);
        assert.equal(
          complete.headers.get("location"),
          "https://example.test/sdk/connected",
        );
      })();
    },
  });
  await navigation;
  assert.equal(exchanged, true);
  assert.deepEqual(result, { url: "https://example.test/api", token });
  assert.ok(!output.join().includes(token));
  assert.ok(!output.join().includes(code));
});
test("cancel and timeout close the loopback server without issuing a credential", async () => {
  const options = {
    out: () => {},
    fetch: async () =>
      Response.json({
        data: { authorizationUrl: "https://example.test/sdk/connect" },
      }),
  };
  await assert.rejects(
    browserLogin("https://example.test", {
      ...options,
      openBrowser: async (url) => {
        const approval = new URL(url);
        const callback = new URL(approval.searchParams.get("redirectUri"));
        callback.searchParams.set("state", approval.searchParams.get("state"));
        callback.searchParams.set("error", "access_denied");
        await fetch(callback);
      },
    }),
    /cancelled/,
  );
  await assert.rejects(
    browserLogin("https://example.test", {
      ...options,
      noBrowser: true,
      timeoutMs: 10,
    }),
    /timed out/,
  );
});
