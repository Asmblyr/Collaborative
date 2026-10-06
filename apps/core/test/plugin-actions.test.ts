import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import {
  defineAction,
  defineHandler,
  definePlugin,
  useActionContext,
} from "@asmblyr-collaborative/kit";
import { readValidatedBody } from "h3";
import { defineActionContract, z } from "@asmblyr-collaborative/kit/actions";
import type { PluginPreparedAction } from "@asmblyr-collaborative/contracts";
import { loadPlugins } from "../src/plugins/load.js";
import { PluginActions } from "../src/plugins/actions.js";
import { ActionDrafts } from "../src/plugins/action-drafts.js";
import type { Access } from "../src/permissions/access.js";
import { createToolSession } from "../src/tools/session.js";
import { connectInternalMcp } from "../src/mcp/internal-client.js";
import { PluginResults } from "../src/assistant/plugin-results.js";
import { runActionWithSignal } from "../src/plugins/action-execution.js";
import { runActionHandler } from "../src/plugins/action-handler.js";
import { pluginContext } from "./support/plugin-context.js";

const viewer = (id = "user-1", superuser = false): Access => ({
  principal: {
    id,
    kind: "user",
    superuser,
    email: `${id}@example.test`,
    sessionId: "session-1",
  },
  grants: new Map(),
});
const context = async (access: Access) => {
  return {
    ...pluginContext({ id: access.principal.id, kind: access.principal.kind }),
    superuser: access.principal.superuser,
  };
};
const input = { users: 150, monthlyPrice: 990, months: 12, discount: 10 };

test("calculator source and build share schemas, money arithmetic and strict input validation", async () => {
  for (const sourcePlugins of [false, true]) {
    const plugins = await loadPlugins(
      new URL("../../../examples/plugins/package.json", import.meta.url),
      {
        sourcePlugins,
      },
    );
    const actions = new PluginActions(plugins, context);
    const calculator = plugins.find(
      (plugin) => plugin.namespace === "calculator",
    )!;
    assert.deepEqual(calculator.definition, {});
    assert.equal(calculator.endpoints.length, 1);
    assert.equal(calculator.endpoints[0].method, "POST");
    assert.equal(calculator.endpoints[0].path, "/calculator/calculate");
    const result = await actions.execute(
      viewer(),
      "calculator",
      "calculate",
      input,
    );
    assert.deepEqual(result.output, {
      subtotalKopecks: 178_200_000,
      discountKopecks: 17_820_000,
      totalKopecks: 160_380_000,
      currency: "RUB",
    });
    for (const invalid of [
      { ...input, users: 0 },
      { ...input, months: 1.5 },
      { ...input, monthlyPrice: 0.001 },
      { ...input, discount: 101 },
      { ...input, actor: "admin" },
      { ...input, monthlyPrice: "990" },
    ]) {
      await assert.rejects(
        actions.execute(viewer(), "calculator", "calculate", invalid),
        {
          statusCode: 400,
        },
      );
    }
    const rounding = await actions.execute(
      viewer(),
      "calculator",
      "calculate",
      {
        users: 1,
        months: 1,
        monthlyPrice: 0.01,
        discount: 50,
      },
    );
    assert.deepEqual(rounding.output, {
      subtotalKopecks: 1,
      discountKopecks: 1,
      totalKopecks: 0,
      currency: "RUB",
    });
  }
});

test("MCP plugin actions reauthorize, isolate drafts, reject forged results and keep secrets out of discovery", async (t) => {
  const contract = defineActionContract({
    id: "echo",
    page: "home",
    title: "Echo",
    description: "Return a bounded integer",
    input: z.strictObject({ value: z.number().int() }),
    output: z.strictObject({ value: z.number().int() }),
  });
  const handler = defineHandler({
    meta: {
      asmblyr: defineAction({ contract, access: "superuser", mcp: true }),
    },
    async handler(event) {
      const ctx = useActionContext(event);
      assert.deepEqual(Object.keys(ctx).sort(), [
        "actor",
        "items",
        "signal",
        "superuser",
      ]);
      assert.equal(ctx.actor.id, "user-1");
      assert.equal(event.context.asmblyr, undefined);
      assert.equal(event.req.headers.has("authorization"), false);
      return readValidatedBody(event, contract.input);
    },
  });
  let access = viewer("user-1", true);
  const actions = new PluginActions(
    [
      {
        name: "test",
        namespace: "example",
        hasUi: true,
        endpoints: [{ method: "POST", path: "/example/echo", handler }],
        definition: definePlugin({}),
      },
    ],
    context,
  );
  assert.equal(actions.definitions(viewer()).length, 0);
  const db = knex({ client: "pg" });
  const mcp = await connectInternalMcp(
    createToolSession(db, access, async () => access),
    actions,
  );
  t.after(async () => {
    await mcp.close();
    await db.destroy();
  });
  const advertised = mcp.definitions.find(
    (entry) => entry.name === "plugin_example__echo",
  )!;
  assert.ok(advertised);
  assert.deepEqual(advertised.parameters.required, ["value"]);
  assert.equal(advertised.parameters.additionalProperties, false);
  const result = (await mcp.call(advertised.name, { value: 3 })) as {
    prepared: PluginPreparedAction;
  };
  const draft = result.prepared;
  assert.deepEqual(
    (await actions.prepared(access, "example", draft.draftId)).input,
    {
      value: 3,
    },
  );
  await assert.rejects(
    () => actions.prepared(viewer("another", true), "example", draft.draftId),
    {
      statusCode: 404,
    },
  );
  await assert.rejects(() => actions.prepared(access, "other", draft.draftId), {
    statusCode: 404,
  });
  const presentation = new PluginResults();
  await assert.rejects(
    () => presentation.present(actions, access, { resultId: draft.draftId }),
    {
      statusCode: 400,
    },
  );
  presentation.capture(result);
  assert.deepEqual(
    await presentation.present(actions, access, { resultId: draft.draftId }),
    {
      presented: true,
      requiresUserClick: true,
    },
  );
  // A stale model response cannot re-enable automatic navigation.
  assert.deepEqual(
    await presentation.present(actions, access, {
      resultId: draft.draftId,
      open: true,
    }),
    {
      presented: true,
      requiresUserClick: true,
    },
  );
  assert.equal(presentation.cards.length, 1);
  assert.deepEqual(presentation.cards[0], {
    draftId: draft.draftId,
    namespace: draft.namespace,
    title: draft.title,
    expiresAt: draft.expiresAt,
  });
  access = viewer();
  assert.ok("error" in (await mcp.call(advertised.name, { value: 4 })));
  await assert.rejects(
    () => actions.prepared(access, "example", draft.draftId),
    {
      statusCode: 403,
    },
  );
  access = viewer("another", true);
  assert.ok("error" in (await mcp.call(advertised.name, { value: 4 })));
});

test("prepared forms expire, do not share mutable references, and have bounded owner quotas", () => {
  let now = 1_000;
  const drafts = new ActionDrafts(() => now, 50);
  const value = {
    namespace: "test",
    actionId: "run",
    pageId: "home",
    title: "Test",
    input: { amount: 1 },
    output: {},
  };
  const draft = drafts.create("owner", value);
  value.input.amount = 5;
  assert.deepEqual(drafts.get("owner", "test", draft.draftId).input, {
    amount: 1,
  });
  for (let index = 1; index < 32; index++) drafts.create("owner", value);
  assert.throws(() => drafts.create("owner", value), { statusCode: 429 });
  now += 50;
  assert.throws(() => drafts.get("owner", "test", draft.draftId), {
    statusCode: 404,
  });
  assert.ok(drafts.create("owner", value));
});

test("actions reject incompatible schemas and invalid handler output", async () => {
  assert.throws(
    () =>
      defineAction({
        contract: defineActionContract({
          id: "bad",
          title: "Bad",
          description: "Bad",
          input: z.object({ value: z.string().optional() }),
          output: z.strictObject({}),
        }),
        access: "authenticated",
      }),
    /strict objects/,
  );
  const action = defineAction({
    contract: defineActionContract({
      id: "bad",
      title: "Bad",
      description: "Bad",
      input: z.strictObject({}),
      output: z.strictObject({ amount: z.number().min(0) }),
    }),
    access: "authenticated",
  });
  const endpoint = {
    method: "POST" as const,
    path: "/example/bad",
    handler: defineHandler(() => ({ amount: -1 })),
  };
  await assert.rejects(
    runActionHandler(
      endpoint,
      action,
      {},
      { ...(await context(viewer())), signal: new AbortController().signal },
    ),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runActionHandler(
      endpoint,
      action,
      {},
      { ...(await context(viewer())), signal: controller.signal },
    ),
    { name: "AbortError" },
  );
});
test("cancellation stops waiting for an uncooperative plugin", async () => {
  const controller = new AbortController();
  const pending = runActionWithSignal(
    controller.signal,
    () => new Promise<never>(() => {}),
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
