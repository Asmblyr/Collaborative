import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { defineHandler, definePlugin, useAsmblyr, type EndpointDefinition } from "@asmblyr/kit";
import { getRouterParam, HTTPError, mockEvent, readValidatedBody, setCookie } from "h3";
import { registerErrorHandler } from "../src/http/error-handler.js";
import { registerPluginRoutes } from "../src/plugins/routes.js";
import { pluginContext } from "./support/plugin-context.js";

function host(endpoints: EndpointDefinition[]) {
  const app = Fastify();
  registerErrorHandler(app);
  app.post("/core-json", async (request) => request.body);
  registerPluginRoutes(
    app,
    [{ name: "example", definition: definePlugin({}), endpoints }],
    async (authorization) => {
      if (!authorization) throw new HTTPError({ status: 401, message: "Sign in" });
      return pluginContext({ id: authorization, kind: "service" });
    },
  );
  return app;
}

const headers = { authorization: "service-1" };

test("H3 validates POST, runs handler middleware and keeps Core JSON parsing unchanged", async (t) => {
  let calls = 0;
  const app = host([
    {
      method: "POST",
      path: "/example/validate",
      handler: defineHandler({
        middleware: [
          (event, next) => {
            event.res.headers.set("x-middleware", "ran");
            return next();
          },
        ],
        handler: async (event) => {
          calls++;
          const body = await readValidatedBody(event, (value: unknown) => {
            if (
              !value ||
              typeof value !== "object" ||
              !("text" in value) ||
              typeof value.text !== "string"
            )
              return false;
            return { text: value.text };
          });
          event.res.status = 201;
          return { text: body.text, actor: useAsmblyr(event).actor };
        },
      }),
    },
  ]);
  t.after(() => app.close());
  const denied = await app.inject({
    method: "POST",
    url: "/example/validate",
    payload: { text: "ok" },
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(calls, 0);
  const success = await app.inject({
    method: "POST",
    url: "/example/validate",
    headers,
    payload: { text: "ok" },
  });
  assert.equal(success.statusCode, 201, success.body);
  assert.equal(success.headers["x-middleware"], "ran");
  assert.deepEqual(success.json(), { text: "ok", actor: { id: "service-1", kind: "service" } });
  for (const payload of ['{"text":123}', "{broken"]) {
    const invalid = await app.inject({
      method: "POST",
      url: "/example/validate",
      headers: { ...headers, "content-type": "application/json" },
      payload,
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.ok(invalid.json().requestId);
  }
  const core = await app.inject({
    method: "POST",
    url: "/core-json",
    payload: { untouched: true },
  });
  assert.deepEqual(core.json(), { untouched: true });
});

test("body limits apply before invoking the handler; multipart bytes reach H3 intact", async (t) => {
  let calls = 0;
  const app = host([
    {
      method: "POST",
      path: "/example/upload",
      handler: async (event) => {
        calls++;
        const form = await event.req.formData();
        const file = form.get("file");
        assert.ok(file && typeof file !== "string");
        return { name: file.name, bytes: [...new Uint8Array(await file.arrayBuffer())] };
      },
    },
  ]);
  t.after(() => app.close());
  const large = await app.inject({
    method: "POST",
    url: "/example/upload",
    headers,
    payload: Buffer.alloc(1_048_577),
  });
  assert.equal(large.statusCode, 413);
  assert.equal(calls, 0);
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array([0, 255, 128, 1])]), "sample.bin");
  const request = new Request("http://localhost/", { method: "POST", body: form });
  const response = await app.inject({
    method: "POST",
    url: "/example/upload",
    headers: { ...headers, "content-type": request.headers.get("content-type")! },
    payload: Buffer.from(await request.arrayBuffer()),
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { name: "sample.bin", bytes: [0, 255, 128, 1] });
});

test("H3 preserves status, cookies, redirects, binary and empty responses", async (t) => {
  const app = host([
    {
      method: "GET",
      path: "/example/cookies",
      handler: (event) => {
        setCookie(event, "first", "one", { httpOnly: true });
        setCookie(event, "second", "two", { httpOnly: true });
        return new Response(null, { status: 302, headers: { location: "/api/example/done" } });
      },
    },
    {
      method: "GET",
      path: "/example/binary",
      handler: () =>
        new Response(new Uint8Array([0, 255, 128]), {
          headers: { "content-type": "application/octet-stream" },
        }),
    },
    {
      method: "DELETE",
      path: "/example/empty",
      handler: () => new Response(null, { status: 204 }),
    },
    {
      method: "GET",
      path: "/example/limited",
      handler: () => {
        throw new HTTPError({ status: 429, message: "Slow down", headers: { "retry-after": "5" } });
      },
    },
    {
      method: "GET",
      path: "/example/error",
      handler: () => {
        throw new HTTPError({ status: 500, message: "secret", data: { secret: true } });
      },
    },
    {
      method: "GET",
      path: "/example/cyclic",
      handler: () => {
        const value = { nested: {} };
        value.nested = value;
        return value;
      },
    },
  ]);
  t.after(() => app.close());
  const cookies = await app.inject({ url: "/example/cookies", headers });
  assert.equal(cookies.statusCode, 302);
  assert.equal(cookies.headers.location, "/api/example/done");
  assert.equal(cookies.cookies.length, 2);
  const binary = await app.inject({ url: "/example/binary", headers });
  assert.deepEqual([...binary.rawPayload], [0, 255, 128]);
  assert.equal(binary.headers["content-type"], "application/octet-stream");
  const empty = await app.inject({ method: "DELETE", url: "/example/empty", headers });
  assert.equal(empty.statusCode, 204);
  assert.equal(empty.body, "");
  const limited = await app.inject({ url: "/example/limited", headers });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["retry-after"], "5");
  for (const url of ["/example/error", "/example/cyclic"]) {
    const failure = await app.inject({ url, headers });
    assert.equal(failure.statusCode, 500);
    assert.equal(failure.json().code, "INTERNAL_ERROR");
    assert.ok(failure.json().requestId);
    assert.doesNotMatch(failure.body, /secret|circular/i);
  }
});

test("request identities stay separate and H3 params are decoded once on demand", async (t) => {
  const app = host([
    {
      method: "GET",
      path: "/example/:id",
      handler: async (event) => {
        await Promise.resolve();
        return {
          actor: useAsmblyr(event).actor.id,
          id: getRouterParam(event, "id", { decode: true }),
        };
      },
    },
  ]);
  t.after(() => app.close());
  const responses = await Promise.all(
    ["one", "two"].map((id) =>
      app.inject({ url: "/example/%252e", headers: { authorization: id } }),
    ),
  );
  responses.forEach((response, index) =>
    assert.deepEqual(response.json(), { actor: ["one", "two"][index], id: "%2e" }),
  );
  assert.throws(() => useAsmblyr(mockEvent("/")), /context is unavailable/);
});

test(
  "streaming sends the first chunk before completion and aborts on disconnect",
  { timeout: 8000 },
  async (t) => {
    let disconnect!: () => void;
    const disconnected = new Promise<void>((resolve) => {
      disconnect = resolve;
    });
    const app = host([
      {
        method: "GET",
        path: "/example/stream",
        handler: (event) => {
          const body = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("first\n"));
              event.req.signal.addEventListener(
                "abort",
                () => {
                  controller.close();
                  disconnect();
                },
                { once: true },
              );
            },
          });
          return new Response(body, { headers: { "content-type": "text/event-stream" } });
        },
      },
    ]);
    t.after(() => {
      app.server.closeAllConnections();
      return app.close();
    });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    const response = await fetch(`${address}/example/stream`, {
      headers,
      signal: AbortSignal.any([controller.signal, t.signal, AbortSignal.timeout(3000)]),
    });
    const reader = response.body!.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), "first\n");
    await reader.cancel();
    controller.abort();
    await disconnected;
  },
);
