import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { HTTPError } from "h3";
import {
  defineAction,
  defineHandler,
  definePlugin,
  type EndpointDefinition,
} from "@asmblyr-collaborative/kit";
import { defineActionContract, z } from "@asmblyr-collaborative/kit/actions";
import { PluginActions } from "../src/plugins/actions.js";
import type { LoadedPlugin } from "../src/plugins/definition.js";
import type { Access } from "../src/permissions/access.js";
import { registerErrorHandler } from "../src/http/error-handler.js";
import { registerPluginRoutes } from "../src/plugins/routes.js";
import { pluginContext } from "./support/plugin-context.js";

const access: Access = {
  principal: {
    kind: "user",
    id: "test",
    superuser: true,
    email: "test@example.test",
    sessionId: "test",
  },
  grants: new Map(),
};
const contract = defineActionContract({
  id: "calculate",
  title: "Calculate",
  description: "Return a number",
  input: z.strictObject({}),
  output: z.strictObject({ value: z.number() }),
});
const context = async () => pluginContext({ id: "test", kind: "user" });
function plugin(endpoints: EndpointDefinition[]): LoadedPlugin {
  return {
    name: "test",
    namespace: "test",
    definition: definePlugin({}),
    endpoints,
  };
}
function endpoint(mcp = false): EndpointDefinition {
  return {
    method: "POST",
    path: "/test/calculate",
    handler: defineHandler({
      meta: {
        asmblyr: defineAction({ contract, access: "authenticated", mcp }),
      },
      handler: () => ({ value: 42 }),
    }),
  };
}

test("only explicitly annotated endpoints are exposed to MCP", async () => {
  const plain = {
    method: "GET" as const,
    path: "/test/status",
    handler: defineHandler(() => ({ status: "ok" })),
  };
  const actions = new PluginActions([plugin([plain, endpoint()])], context);
  assert.deepEqual(actions.definitions(access), []);
  assert.equal(actions.hasTool("plugin_test__calculate"), false);
  await assert.rejects(actions.callTool(access, "plugin_test__calculate", {}), {
    statusCode: 404,
  });
  assert.deepEqual(
    (await actions.execute(access, "test", "calculate", {})).output,
    { value: 42 },
  );
  const enabled = new PluginActions([plugin([plain, endpoint(true)])], context);
  assert.deepEqual(
    enabled.definitions(access).map((entry) => entry.name),
    ["plugin_test__calculate"],
  );
});

test("invalid annotations and duplicate action IDs fail before serving requests", () => {
  const route = endpoint(true);
  for (const invalid of [
    { ...route, method: "GET" as const },
    { ...route, path: "/test/:id" },
    { ...route, path: "/other/calculate" },
  ]) {
    assert.throws(() => new PluginActions([plugin([invalid])], context));
  }
  assert.throws(
    () =>
      new PluginActions(
        [plugin([route, { ...route, path: "/test/duplicate" }])],
        context,
      ),
    /duplicated/,
  );
  const malformed = defineHandler(() => ({}));
  malformed.meta = { asmblyr: { mcp: true } as never };
  assert.throws(
    () =>
      new PluginActions([plugin([{ ...route, handler: malformed }])], context),
    /invalid action/,
  );
});

test("HTTP and MCP enforce the same access before running H3 middleware", async (t) => {
  let middlewareCalls = 0;
  let handlerCalls = 0;
  let current: Access = {
    ...access,
    principal: { ...access.principal, superuser: false },
  };
  const original = endpoint(true);
  const handler = defineHandler({
    meta: {
      asmblyr: defineAction({ contract, access: "superuser", mcp: true }),
    },
    middleware: [
      async (_event, next) => {
        middlewareCalls++;
        return next();
      },
    ],
    handler: () => {
      handlerCalls++;
      return { value: 42 };
    },
  });
  const plugins = [plugin([{ ...original, handler }])];
  const actions = new PluginActions(plugins, context);
  const app = Fastify();
  registerErrorHandler(app);
  registerPluginRoutes(
    app,
    plugins,
    async (authorization) => {
      if (!authorization)
        throw new HTTPError({ status: 401, message: "Sign in" });
      return {
        ...pluginContext({ id: current.principal.id, kind: "user" }),
        access: current,
      };
    },
    actions,
  );
  t.after(() => app.close());
  const request = {
    method: "POST" as const,
    url: "/test/calculate",
    payload: {},
  };
  const headers = { authorization: "test" };
  assert.equal((await app.inject(request)).statusCode, 401);
  assert.equal((await app.inject({ ...request, headers })).statusCode, 403);
  assert.deepEqual(actions.definitions(current), []);
  await assert.rejects(
    actions.callTool(current, "plugin_test__calculate", {}),
    {
      statusCode: 403,
    },
  );
  assert.equal(middlewareCalls, 0);
  assert.equal(handlerCalls, 0);

  current = access;
  const response = await app.inject({ ...request, headers });
  assert.equal(response.statusCode, 200, response.body);
  const result = await actions.callTool(current, "plugin_test__calculate", {});
  assert.deepEqual(response.json().data, result);
  assert.equal(middlewareCalls, 2);
  assert.equal(handlerCalls, 2);
});
