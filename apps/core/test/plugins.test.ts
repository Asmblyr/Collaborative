import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { definePlugin, EndpointError, useAsmblyr, type EndpointHandler } from "@asmblyr/kit";
import { getQuery, getRouterParam, readBody } from "h3";
import { registerErrorHandler } from "../src/http/error-handler.js";
import { registerPluginBoundary } from "../src/plugins/routing.js";
import { registerPluginRoutes } from "../src/plugins/routes.js";
import { createApp } from "../src/app.js";
import type { LoadedPlugin } from "../src/plugins/definition.js";
import { pluginContext } from "./support/plugin-context.js";

function plugin(
  path: string,
  handler: EndpointHandler = () => ({ data: "ok" }),
  name = "comments",
): LoadedPlugin {
  return { name, definition: definePlugin({}), endpoints: [{ method: "GET", path, handler }] };
}

function host() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerPluginBoundary(app);
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}

test("plugin handlers require authentication and receive only the public request context", async (t) => {
  const app = host();
  t.after(() => app.close());
  let calls = 0;
  registerPluginRoutes(
    app,
    [
      plugin("/comments/:id", (event) => {
        const context = useAsmblyr(event);
        calls++;
        assert.deepEqual(context.actor, { id: "user-1", kind: "user" });
        assert.ok(Object.isFrozen(context.actor));
        assert.ok(context.requestId);
        assert.equal(typeof context.logger.info, "function");
        assert.equal("database" in context, false);
        assert.equal("headers" in context, false);
        assert.equal(event.req.headers.has("authorization"), false);
        return { data: { id: getRouterParam(event, "id"), query: getQuery(event).search } };
      }),
    ],
    async (authorization) => {
      if (authorization !== "Bearer valid") throw new EndpointError(401, "UNAUTHORIZED", "Sign in");
      const actor = { id: "user-1", kind: "user" as const, secret: "must not reach the plugin" };
      return pluginContext(actor);
    },
  );

  for (const authorization of [undefined, "Bearer expired"]) {
    const response = await app.inject({
      method: "GET",
      url: "/comments/4",
      headers: authorization ? { authorization } : {},
    });
    assert.equal(response.statusCode, 401);
  }
  assert.equal(calls, 0);
  const response = await app.inject({
    method: "GET",
    url: "/comments/4?search=hello",
    headers: { authorization: "Bearer valid" },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { data: { id: "4", query: "hello" } });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(calls, 1);
});

test("the UI fallback only reaches plugin endpoints", async (t) => {
  const app = host();
  t.after(() => app.close());
  registerPluginRoutes(app, [plugin("/comments/status")], async () =>
    pluginContext({
      id: "service-1",
      kind: "service",
    }),
  );
  const headers = { "x-asmblyr-plugin-route": "1" };
  assert.equal((await app.inject({ url: "/comments/status", headers })).statusCode, 200);
  assert.equal((await app.inject({ url: "/health", headers })).statusCode, 404);
  assert.equal((await app.inject({ url: "/missing", headers })).statusCode, 404);
  assert.equal((await app.inject({ url: "/health" })).statusCode, 200);
});

test("string handler results follow H3 text semantics", async (t) => {
  const app = host();
  t.after(() => app.close());
  registerPluginRoutes(app, [plugin("/comments/text", () => "hello")], async () =>
    pluginContext({
      id: "user-1",
      kind: "user",
    }),
  );
  const response = await app.inject("/comments/text");
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(String(response.headers["content-type"] ?? ""), /application\/json/);
  assert.equal(response.body, "hello");
});

test("client errors use the common format and server failures hide details", async (t) => {
  const app = host();
  t.after(() => app.close());
  registerPluginRoutes(
    app,
    [
      {
        name: "comments",
        definition: definePlugin({}),
        endpoints: [
          {
            method: "GET",
            path: "/comments/denied",
            handler: () => {
              throw new EndpointError(403, "DENIED", "No access");
            },
          },
          {
            method: "GET",
            path: "/comments/failed",
            handler: () => {
              throw new Error("secret connection details");
            },
          },
          {
            method: "POST",
            path: "/comments/echo",
            handler: async (event) => {
              const body = await readBody<{ text: string }>(event);
              assert.ok(body);
              return { data: body.text };
            },
          },
        ],
      },
    ],
    async () => pluginContext({ id: "1", kind: "user" }),
  );
  const denied = await app.inject("/comments/denied");
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().code, "DENIED");
  assert.ok(denied.json().requestId);
  const failed = await app.inject("/comments/failed");
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.json().code, "INTERNAL_ERROR");
  assert.doesNotMatch(failed.body, /secret/);
  const created = await app.inject({
    method: "POST",
    url: "/comments/echo",
    payload: { text: "hello" },
  });
  assert.deepEqual(created.json(), { data: "hello" });
});

test("a plugin cannot take a Core namespace, including a new subpath", async (t) => {
  const app = host();
  t.after(() => app.close());
  registerPluginRoutes(app, [plugin("/health/custom")], async () =>
    pluginContext({
      id: "1",
      kind: "user",
    }),
  );
  await assert.rejects(async () => app.ready(), /belongs to Core/);
});

test("namespace ownership works when Core routes register after the plugin", async (t) => {
  const app = host();
  t.after(() => app.close());
  registerPluginRoutes(app, [plugin("/items/custom")], async () =>
    pluginContext({ id: "1", kind: "user" }),
  );
  app.register(async (scope) => {
    scope.get("/items/:collection", async () => ({}));
  });
  await assert.rejects(async () => app.ready(), /belongs to comments/);
});

test("two plugins cannot claim the same namespace", async (t) => {
  const app = host();
  t.after(() => app.close());
  registerPluginRoutes(
    app,
    [plugin("/comments/one"), plugin("/comments/two", undefined, "other")],
    async () => pluginContext({ id: "1", kind: "user" }),
  );
  await assert.rejects(async () => app.ready(), /belongs to comments/);
});

test("duplicate routes and package names fail at registration", async (t) => {
  for (const duplicateName of [false, true]) {
    const app = host();
    t.after(() => app.close());
    const entry = plugin("/comments/status");
    if (!duplicateName) entry.endpoints = [entry.endpoints[0], entry.endpoints[0]];
    const register = () =>
      registerPluginRoutes(app, duplicateName ? [entry, entry] : [entry], async () =>
        pluginContext({
          id: "1",
          kind: "user",
        }),
      );
    if (duplicateName) assert.throws(register, /Duplicate plugin/);
    else {
      register();
      await assert.rejects(async () => app.ready(), /already declared/);
    }
  }
});

test("the real app uses its database authentication and keeps health available", async (t) => {
  const app = createApp({ logger: false, plugins: [plugin("/comments/status")] });
  t.after(() => app.close());
  assert.equal((await app.inject("/health")).statusCode, 200);
  assert.equal((await app.inject("/comments/status")).statusCode, 503);
});
