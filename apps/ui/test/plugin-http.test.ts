import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import {
  pluginRequestHeaders,
  pluginResponse,
  PluginBodyTooLarge,
  readPluginBody,
} from "../src/lib/plugin-http";
import { requestCoreWithSession } from "../src/lib/core-session-request";
import { setSessionCookies } from "../src/lib/session-cookies";

test("plugin request forwards custom headers and cookies but never browser session credentials", () => {
  const request = new Request("http://localhost/api/example", {
    headers: {
      authorization: "Bearer injected",
      cookie: "asmblyr_access=secret; preference=compact; asmblyr_refresh=secret",
      connection: "x-private",
      "x-private": "hop-only",
      "x-custom": "kept",
      "content-length": "50",
      "content-type": "text/plain",
      "x-asmblyr-plugin-route": "0",
    },
  });
  const headers = pluginRequestHeaders(request);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers.cookie, "preference=compact");
  assert.equal(headers["x-private"], undefined);
  assert.equal(headers["content-length"], undefined);
  assert.equal(headers["x-custom"], "kept");
  assert.equal(headers["content-type"], "text/plain");
  assert.equal(headers["x-asmblyr-plugin-route"], "1");
});

test("plugin body preserves binary data and rejects oversized bodies without Content-Length", async () => {
  const bytes = new Uint8Array([0, 255, 128, 65]);
  const request = new Request("http://localhost/", { method: "POST", body: bytes });
  assert.deepEqual(await readPluginBody(request), bytes);
  const oversized = new Request("http://localhost/", {
    method: "POST",
    body: new Uint8Array(1_048_577),
  });
  await assert.rejects(readPluginBody(oversized), PluginBodyTooLarge);
});

test("proxy forwards the first stream chunk without waiting for the rest and propagates cancellation", async () => {
  let cancelled = false;
  const upstream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("first\n"));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
  const response = pluginResponse(upstream);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const reader = response.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "first\n");
  await reader.cancel();
  assert.equal(cancelled, true);
});

test("proxy preserves redirect, headers, cookies and binary responses; reserved cookies cannot overwrite sessions", async () => {
  const headers = new Headers({ location: "/api/example/done", "x-custom": "kept" });
  headers.append("set-cookie", "plugin=one; Path=/api/example; HttpOnly");
  headers.append("set-cookie", "second=two; Path=/api/example; HttpOnly");
  headers.append("set-cookie", "asmblyr_access=bad; Path=/");
  headers.append("set-cookie", "asmblyr_refresh=bad; Path=/");
  const forwarded = pluginResponse(new Response(null, { status: 302, headers }));
  const response = new NextResponse(forwarded.body, {
    status: forwarded.status,
    headers: forwarded.headers,
  });
  setSessionCookies(response, new Request("http://localhost/"), {
    accessToken: "renewed",
    refreshToken: "renewed-refresh",
    expiresIn: 900,
    refreshExpiresAt: "2030-01-01T00:00:00Z",
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/api/example/done");
  assert.equal(response.headers.get("x-custom"), "kept");
  assert.equal(response.headers.getSetCookie().length, 4);
  assert.doesNotMatch(response.headers.get("set-cookie")!, /=bad/);
  const bytes = new Uint8Array([0, 128, 255]);
  const binary = pluginResponse(
    new Response(bytes, {
      headers: {
        "content-type": "application/octet-stream",
        "content-encoding": "gzip",
        "content-length": "300",
        "content-disposition": 'attachment; filename="example.bin"',
      },
    }),
  );
  assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), bytes);
  assert.equal(binary.headers.get("content-type"), "application/octet-stream");
  assert.equal(binary.headers.get("content-encoding"), null);
  assert.equal(binary.headers.get("content-length"), null);
  assert.match(binary.headers.get("content-disposition")!, /example.bin/);
  assert.equal(pluginResponse(new Response(null, { status: 204 })).body, null);
});

test("session refresh replays the original plugin bytes and never follows upstream redirects", async (t) => {
  const body = new Uint8Array([0, 255, 128]);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    if (url.pathname === "/auth/refresh")
      return Response.json({
        accessToken: "renewed",
        refreshToken: "new-refresh",
        expiresIn: 900,
        refreshExpiresAt: "2030-01-01T00:00:00Z",
      });
    calls++;
    assert.deepEqual(init.body, body);
    assert.equal(init.redirect, "manual");
    assert.equal(new Headers(init.headers).get("content-type"), "application/octet-stream");
    if (calls === 1) return new Response(null, { status: 401 });
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer renewed");
    return new Response(null, { status: 302, headers: { location: "https://example.test/" } });
  });
  const response = await requestCoreWithSession(
    "/example/upload",
    {
      method: "POST",
      body,
      headers: { "content-type": "application/octet-stream" },
      redirect: "manual",
      timeoutMs: 1000,
    },
    { accessToken: "expired", refreshToken: "plugin-refresh" },
    () => {},
  );
  assert.equal(response.status, 302);
  assert.equal(calls, 2);
});
