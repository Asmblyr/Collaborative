import assert from "node:assert/strict";
import test from "node:test";
import type { Knex } from "knex";
import type { Collection } from "../src/collections/types.js";
import type { Access } from "../src/permissions/access.js";
import { AccessDeniedError } from "../src/permissions/access.js";
import { ItemError } from "../src/items/validation.js";
import {
  isRowScopedRead,
  mcpCatalog,
  requireMcpCollection,
} from "../src/tools/collection-scope.js";
import { describeCollection } from "../src/tools/describe-collection.js";
import { parseDataToolInput } from "../src/tools/data-tool-input.js";
import { dataProjection } from "../src/tools/data-projection.js";
import { parseAggregateInput } from "../src/tools/aggregate-input.js";
import { authorizeAggregateFields } from "../src/tools/aggregate-fields.js";
import { toolErrorResult, ToolArgumentError } from "../src/tools/errors.js";
import { createToolSession } from "../src/tools/session.js";
import { createToolExecutor } from "../src/assistant/tool-execution.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { contextToolDefinitions } from "../src/assistant/tool-contract.js";
import {
  buildAssistantInstructions,
  formatAssistantDate,
} from "../src/assistant/instructions.js";
import { currentUserIdentity } from "../src/assistant/page-context.js";
import { contextualArguments } from "../src/assistant/context-tools.js";

function makeCollection(overrides: Partial<Collection>): Collection {
  return {
    name: "tasks",
    displayName: "Tasks",
    folderId: null,
    mode: "standard",
    primaryKey: { name: "id", type: "serial" },
    timestamps: { createdAt: true, updatedAt: false },
    fields: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeAccess(overrides: Partial<Access> = {}): Access {
  return {
    principal: {
      kind: "user",
      id: "11111111-1111-4111-8111-111111111111",
      email: "editor@example.test",
      superuser: false,
      sessionId: "22222222-2222-4222-8222-222222222222",
    },
    grants: new Map([
      ["tasks:read", ["*"]],
      ["tasks:create", ["*"]],
      ["tasks:update", ["*"]],
    ]),
    ...overrides,
  };
}

test("BUG-03: mcpCatalog keeps @users M2O relations while stripping MCP-disabled collections", () => {
  const catalog: Collection[] = [
    makeCollection({
      name: "tasks",
      fields: [
        { name: "title", type: "text", required: true, nullable: false },
        {
          name: "assignee_id",
          type: "relation",
          required: false,
          nullable: true,
          relation: {
            kind: "m2o",
            collection: "@users",
            primaryKey: { name: "id", type: "uuid" },
            onDelete: "setNull",
          },
        },
        {
          name: "project_id",
          type: "relation",
          required: false,
          nullable: true,
          relation: {
            kind: "m2o",
            collection: "projects",
            primaryKey: { name: "id", type: "serial" },
            onDelete: "setNull",
          },
        },
        {
          name: "secret_id",
          type: "relation",
          required: false,
          nullable: true,
          relation: {
            kind: "m2o",
            collection: "secrets",
            primaryKey: { name: "id", type: "serial" },
            onDelete: "setNull",
          },
        },
      ],
    }),
    makeCollection({
      name: "projects",
      mcp: { enabled: true, description: null },
    }),
    makeCollection({
      name: "secrets",
      mcp: { enabled: false, description: null },
    }),
  ];

  const scoped = mcpCatalog(catalog);
  const tasks = scoped.find((c) => c.name === "tasks")!;
  assert.deepEqual(
    tasks.fields.map((field) => field.name),
    ["title", "assignee_id", "project_id"],
  );
  assert.equal(
    scoped.some((c) => c.name === "secrets"),
    false,
  );
});

test("BUG-03: describeCollection exposes @users fields, relation metadata and filterPaths without nested user paths", async () => {
  const tasks = makeCollection({
    name: "tasks",
    fields: [
      { name: "title", type: "text", required: true, nullable: false },
      {
        name: "assignee_id",
        type: "relation",
        required: false,
        nullable: true,
        relation: {
          kind: "m2o",
          collection: "@users",
          primaryKey: { name: "id", type: "uuid" },
          onDelete: "setNull",
        },
      },
    ],
  });
  const access = makeAccess();
  const schema = {
    settings: {
      internalId: "33333333-3333-4333-8333-333333333333",
      displayName: "Задачи",
      primaryKey: { name: "id" as const, type: "serial" as const },
      timestamps: { createdAt: true, updatedAt: false },
      mcp: { enabled: true, description: null },
      state: null,
    },
    fields: new Map([
      [
        "title",
        {
          type: "text",
          nullable: false,
          required: true,
          relation: undefined,
        },
      ],
      [
        "assignee_id",
        {
          type: "relation",
          nullable: true,
          required: false,
          relation: {
            collection: "@users",
            primaryKey: "id",
            primaryKeyType: "uuid",
          },
        },
      ],
    ]),
  };

  const described = await describeCollection(
    {} as Knex,
    "tasks",
    {
      allowed: ["*"],
      schema: schema as never,
      catalog: mcpCatalog([tasks]),
    },
    access,
  );

  const assigneeField = described.fields.find(
    (field) => field.name === "assignee_id",
  );
  assert.ok(assigneeField);
  assert.equal(assigneeField.readableValue, true);
  assert.deepEqual(assigneeField.writable, { create: true, update: true });
  assert.deepEqual(assigneeField.relation, {
    kind: "m2o",
    collection: "@users",
    displayName: "@users",
    primaryKey: { name: "id", type: "uuid" },
  });

  const filterPaths = described.filterPaths as {
    path: string;
    type: string;
    keyType?: string;
  }[];
  const assigneePath = filterPaths.find(
    (entry) => entry.path === "assignee_id",
  );
  assert.ok(assigneePath);
  assert.equal(assigneePath.type, "key");
  assert.equal(assigneePath.keyType, "uuid");
  assert.equal(
    filterPaths.some((entry) => entry.path.startsWith("assignee_id.")),
    false,
  );
});

test("BUG-03: currentUserIdentity returns only safe id and displayName", async () => {
  const access = makeAccess();
  const mockDb = (row: Record<string, unknown> | undefined) =>
    (() => ({
      where: () => ({
        first: async () => row,
      }),
    })) as unknown as Knex;

  assert.deepEqual(
    await currentUserIdentity(
      mockDb({
        display_name: "  Иван Петров  ",
        first_name: "Иван",
        last_name: "Петров",
        email: "secret@example.test",
      }),
      access,
    ),
    { id: access.principal.id, displayName: "Иван Петров" },
  );
  assert.deepEqual(
    await currentUserIdentity(
      mockDb({ display_name: null, first_name: "Анна", last_name: "Иванова" }),
      access,
    ),
    { id: access.principal.id, displayName: "Анна Иванова" },
  );
  assert.deepEqual(await currentUserIdentity(mockDb(undefined), access), {
    id: access.principal.id,
    displayName: null,
  });
});

test("BUG-05: SCHEMA_REQUIRED does not block valid retry after describe_collection succeeds", async () => {
  const signal = new AbortController().signal;
  let described = false;
  let searchExecutions = 0;
  const executor = createToolExecutor(
    {
      record: (fn) => fn(),
      tools: {
        context: {},
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async (name) => {
          if (name === "describe_collection") {
            described = true;
            return { collection: "tasks", fields: [] };
          }
          if (name === "search_items") {
            searchExecutions++;
            if (!described) {
              return {
                code: "SCHEMA_REQUIRED",
                error: "Collection schema is required.",
                hint: "Call describe_collection first.",
              };
            }
            return { collection: "tasks", items: [{ values: { id: "1" } }] };
          }
          return { ok: true };
        },
      },
    },
    signal,
  );

  const searchArgs = JSON.stringify({ collection: "tasks", fields: ["title"] });
  const first = (await executor.execute({
    id: "1",
    name: "search_items",
    arguments: searchArgs,
  })) as { code?: string };
  assert.equal(first.code, "SCHEMA_REQUIRED");
  assert.equal(executor.finalize, false);

  const schema = (await executor.execute({
    id: "2",
    name: "describe_collection",
    arguments: JSON.stringify({ collection: "tasks" }),
  })) as { collection?: string };
  assert.equal(schema.collection, "tasks");
  assert.equal(executor.finalize, false);

  const retried = (await executor.execute({
    id: "3",
    name: "search_items",
    arguments: searchArgs,
  })) as { items?: unknown[]; code?: string };
  assert.equal(retried.code, undefined);
  assert.equal(retried.items?.length, 1);
  assert.equal(searchExecutions, 2);
  assert.equal(executor.finalize, false);
});

test("BUG-05: repeating a SCHEMA_REQUIRED call without describe_collection still triggers REPEATED_TOOL_ERROR", async () => {
  const signal = new AbortController().signal;
  let executions = 0;
  const executor = createToolExecutor(
    {
      record: (fn) => fn(),
      tools: {
        context: {},
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async () => {
          executions++;
          return {
            code: "SCHEMA_REQUIRED",
            error: "Collection schema is required.",
          };
        },
      },
    },
    signal,
  );

  const call = {
    id: "1",
    name: "search_items",
    arguments: JSON.stringify({ collection: "tasks", fields: ["title"] }),
  };
  await executor.execute(call);
  const second = (await executor.execute({ ...call, id: "2" })) as {
    code?: string;
  };
  assert.equal(second.code, "REPEATED_TOOL_ERROR");
  assert.equal(executor.finalize, true);
  assert.equal(executions, 1);
});

test("BUG-05: permanent INVALID_ARGUMENTS failure stays blocked even after describe_collection succeeds", async () => {
  const signal = new AbortController().signal;
  let searchExecutions = 0;
  const executor = createToolExecutor(
    {
      record: (fn) => fn(),
      tools: {
        context: {},
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async (name) => {
          if (name === "describe_collection") {
            return { collection: "tasks", fields: [] };
          }
          searchExecutions++;
          return { code: "INVALID_ARGUMENTS", error: "Bad fields" };
        },
      },
    },
    signal,
  );

  const badCall = {
    id: "1",
    name: "search_items",
    arguments: JSON.stringify({ collection: "tasks", fields: [] }),
  };
  await executor.execute(badCall);
  await executor.execute({
    id: "2",
    name: "describe_collection",
    arguments: JSON.stringify({ collection: "tasks" }),
  });
  const repeated = (await executor.execute({ ...badCall, id: "3" })) as {
    code?: string;
  };
  assert.equal(repeated.code, "REPEATED_TOOL_ERROR");
  assert.equal(executor.finalize, true);
  assert.equal(searchExecutions, 1);
});

test("BUG-05: provider completes tool(X) -> SCHEMA_REQUIRED -> describe_collection -> tool(X) without finalize", async () => {
  const base = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test",
  })!;
  let step = 0;
  let described = false;
  const provider = createAssistantProvider(
    { ...base, api: "chat-completions" },
    async () => {
      step++;
      if (step === 1 || step === 3) {
        return Response.json({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call-${step}`,
                    type: "function",
                    function: {
                      name: "search_items",
                      arguments: JSON.stringify({
                        collection: "tasks",
                        fields: ["title"],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      if (step === 2) {
        return Response.json({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-2",
                    type: "function",
                    function: {
                      name: "describe_collection",
                      arguments: JSON.stringify({ collection: "tasks" }),
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "Найдена 1 задача." },
          },
        ],
      });
    },
  );

  const answer = await provider(
    {
      messages: [{ role: "user", content: "Покажи задачи" }],
      thinking: false,
      reasoningEffort: null,
    },
    undefined,
    null,
    {
      record: (fn) => fn(),
      tools: {
        context: { page: "home" },
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async (name) => {
          if (name === "describe_collection") {
            described = true;
            return { collection: "tasks", fields: [] };
          }
          if (!described) {
            return {
              code: "SCHEMA_REQUIRED",
              error: "Collection schema is required.",
            };
          }
          return { collection: "tasks", items: [{ values: { id: "1" } }] };
        },
      },
    },
  );
  assert.equal(answer.content, "Найдена 1 задача.");
  assert.equal(step, 4);
});

test("BUG-06: data tool input defaults omitted optional keys and reports specific failing argument names", () => {
  const defaults = {
    q: "",
    filter: "",
    sort: "id",
    direction: "asc" as const,
  };

  assert.deepEqual(parseDataToolInput("count_items", {}, defaults), {
    tool: "count_items",
    query: { q: "", filter: undefined },
  });
  assert.deepEqual(
    parseDataToolInput("search_items", { fields: ["title"] }, defaults),
    {
      tool: "search_items",
      fields: ["title"],
      query: {
        q: "",
        filter: undefined,
        page: "1",
        limit: "20",
        sort: "id",
        direction: "asc",
        order: "field",
      },
    },
  );

  const cases: [Parameters<typeof parseDataToolInput>[0], unknown, string][] = [
    ["search_items", { fields: [] }, "fields"],
    ["search_items", { fields: ["title", "title"] }, "fields"],
    ["search_items", { fields: ["title"], page: 0 }, "page"],
    ["search_items", { fields: ["title"], limit: 99 }, "limit"],
    ["search_items", { fields: ["title"], direction: "up" }, "direction"],
    ["search_items", { fields: ["title"], order: "random" }, "order"],
    ["search_items", { fields: ["title"], terms: ["not-a-uuid"] }, "terms"],
    ["read_item", { id: 123, fields: ["title"] }, "id"],
  ];

  for (const [tool, args, expectedArg] of cases) {
    assert.throws(
      () => parseDataToolInput(tool, args, defaults),
      (error: unknown) => {
        assert.ok(error instanceof ToolArgumentError);
        const result = toolErrorResult(error) as {
          code: string;
          error: string;
          hint: string;
          arguments?: string[];
        };
        assert.equal(result.code, "INVALID_ARGUMENTS");
        assert.deepEqual(result.arguments, [expectedArg]);
        assert.ok(result.error.includes(`"${expectedArg}"`));
        assert.ok(!result.error.includes("not-a-uuid"));
        return true;
      },
    );
  }
});

test("BUG-06: dataProjection and aggregate input report specific argument errors without echoing private field names", () => {
  const schema = {
    settings: {
      primaryKey: { name: "id" as const, type: "serial" as const },
      timestamps: { createdAt: false, updatedAt: false },
    },
    fields: new Map([["title", { type: "text", nullable: false }]]),
  };
  assert.throws(
    () => dataProjection(schema as never, ["title"], ["private_secret_col"]),
    (error: unknown) => {
      assert.ok(error instanceof ToolArgumentError);
      const result = toolErrorResult(error) as {
        code: string;
        error: string;
        arguments?: string[];
      };
      assert.equal(result.code, "INVALID_ARGUMENTS");
      assert.deepEqual(result.arguments, ["fields"]);
      assert.ok(result.error.includes('"fields"'));
      assert.ok(!JSON.stringify(result).includes("private_secret_col"));
      return true;
    },
  );

  // Aggregate omitted optional keys default cleanly.
  const parsed = parseAggregateInput({
    metrics: [{ operation: "count", field: null }],
  });
  assert.deepEqual(parsed.groupBy, []);
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);
  assert.deepEqual(parsed.orderBy, { metric: 0, direction: "desc" });

  assert.throws(
    () =>
      parseAggregateInput({
        groupBy: ["status"],
        metrics: [{ operation: "sum", field: null }],
      }),
    (error: unknown) => {
      assert.ok(error instanceof ToolArgumentError);
      const result = toolErrorResult(error) as {
        error: string;
        arguments?: string[];
      };
      assert.deepEqual(result.arguments, ["metrics"]);
      assert.ok(result.error.includes('"metrics"'));
      return true;
    },
  );

  const tasks = makeCollection({
    name: "tasks",
    fields: [{ name: "title", type: "text", required: true, nullable: false }],
  });
  assert.throws(
    () =>
      authorizeAggregateFields(
        "tasks",
        parseAggregateInput({
          metrics: [{ operation: "sum", field: "title" }],
        }),
        {
          allowed: ["*"],
          schema: schema as never,
          catalog: [tasks],
        },
        makeAccess(),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ToolArgumentError);
      const result = toolErrorResult(error) as {
        error: string;
        arguments?: string[];
      };
      assert.deepEqual(result.arguments, ["metrics"]);
      assert.ok(result.error.includes('"metrics"'));
      return true;
    },
  );
});

test("BUG-07: formatAssistantDate and instructions include exact ISO date and timezone", () => {
  const instant = new Date("2026-12-31T22:00:00Z");
  assert.deepEqual(formatAssistantDate(instant, "Asia/Tokyo"), {
    currentDate: "2027-01-01",
    timeZone: "Asia/Tokyo",
  });
  assert.deepEqual(formatAssistantDate(instant, "America/New_York"), {
    currentDate: "2026-12-31",
    timeZone: "America/New_York",
  });
  assert.deepEqual(formatAssistantDate(instant, "Invalid/Zone"), {
    currentDate: "2026-12-31",
    timeZone: "UTC",
  });

  const instructions = buildAssistantInstructions(
    null,
    {
      page: "home",
      currentUser: { id: "user-1", displayName: "Иван" },
    },
    { now: instant, timeZone: "Europe/Moscow" },
  );
  assert.ok(
    instructions.includes(
      "Текущая дата: 2027-01-01 (часовой пояс: Europe/Moscow)",
    ),
  );
  assert.ok(instructions.includes("до конца года"));
});

test("BUG-16: rowScoped detection, jargon-free errors, and prompt RBAC/UI honesty rules", () => {
  const rowRestricted = makeAccess({
    rowRules: new Map([["tasks:read", [{ fields: ["*"], filter: null }]]]),
  });
  const unrestricted = makeAccess();
  const superuser = makeAccess({
    principal: { ...makeAccess().principal, superuser: true },
    rowRules: new Map([["tasks:read", [{ fields: ["*"], filter: null }]]]),
  });

  assert.equal(isRowScopedRead(rowRestricted, "tasks"), true);
  assert.equal(isRowScopedRead(rowRestricted, "other"), false);
  assert.equal(isRowScopedRead(unrestricted, "tasks"), false);
  assert.equal(isRowScopedRead(superuser, "tasks"), false);

  const denied = toolErrorResult(new AccessDeniedError()) as {
    code: string;
    error: string;
  };
  assert.equal(denied.code, "PERMISSION_DENIED");
  assert.ok(!denied.error.includes("MCP"));

  assert.throws(
    () => requireMcpCollection({ mcp: { enabled: false } }),
    (error: unknown) => {
      assert.ok(error instanceof ItemError);
      const result = toolErrorResult(error) as { error: string };
      assert.ok(!result.error.includes("MCP"));
      return true;
    },
  );

  const instructions = buildAssistantInstructions(null, { page: "home" });
  assert.ok(instructions.includes("rowScoped=true"));
  assert.ok(instructions.includes("доступным вам записям"));
  assert.ok(instructions.includes("currentUser.id"));
  assert.ok(instructions.includes('"@users"'));
  assert.ok(
    instructions.includes("Никогда не обещай и не упоминай в тексте кнопки"),
  );
  assert.ok(
    instructions.includes("Не утверждай, что пользователь может назначать"),
  );
  assert.ok(!instructions.includes("через общее ядро MCP"));
  assert.ok(!instructions.includes("Внутренние MCP-инструменты"));
  assert.ok(!instructions.includes("отключена от MCP"));
});

test("BUG-06: createToolSession defaults omitted optional arguments while enforcing required ones", async () => {
  const access = makeAccess();
  const session = createToolSession({} as Knex, access, async () => access);

  // Omitting optional args on search_items passes argument check and reaches SCHEMA_REQUIRED.
  await assert.rejects(
    session.execute("search_items", { collection: "tasks", fields: ["title"] }),
    (error: unknown) => {
      assert.ok(error instanceof ToolArgumentError);
      assert.equal(error.code, "SCHEMA_REQUIRED");
      return true;
    },
  );

  // Omitting optional args on count_items passes argument check and reaches SCHEMA_REQUIRED.
  await assert.rejects(
    session.execute("count_items", { collection: "tasks" }),
    (error: unknown) => {
      assert.ok(error instanceof ToolArgumentError);
      assert.equal(error.code, "SCHEMA_REQUIRED");
      return true;
    },
  );

  // Omitting required non-nullable filter on validate_filter fails with INVALID_ARGUMENTS naming "filter".
  await assert.rejects(
    session.execute("validate_filter", { collection: "tasks" }),
    (error: unknown) => {
      assert.ok(error instanceof ToolArgumentError);
      assert.equal(error.code, "INVALID_ARGUMENTS");
      assert.deepEqual(error.argumentNames, ["filter"]);
      assert.ok(error.message.includes("filter"));
      return true;
    },
  );

  // Omitting required metrics on aggregate_items fails with INVALID_ARGUMENTS naming "metrics".
  await assert.rejects(
    session.execute("aggregate_items", { collection: "tasks" }),
    (error: unknown) => {
      assert.ok(error instanceof ToolArgumentError);
      assert.equal(error.code, "INVALID_ARGUMENTS");
      assert.deepEqual(error.argumentNames, ["metrics"]);
      assert.ok(error.message.includes("metrics"));
      return true;
    },
  );
});

test("contextualArguments inherits table query keys only for tools that declare them as nullable", () => {
  const tableContext = {
    page: "items",
    workspaceId: null,
    collection: "tasks",
    table: {
      page: 1,
      size: 25,
      sort: "title",
      direction: "desc" as const,
      order: "field" as const,
      q: "urgent",
      filter: '{"logic":"and","children":[]}',
      selectedCount: 0,
      editorOpen: false,
    },
  };
  const propsFor = (name: string) =>
    contextToolDefinitions.find((tool) => tool.name === name)!.parameters
      .properties;

  // describe_collection, read_item, create_item, prepare_update, update_item must NOT get q/filter/sort/direction.
  assert.deepEqual(
    contextualArguments(
      "describe_collection",
      { collection: "tasks" },
      tableContext,
      propsFor("describe_collection"),
    ),
    { collection: "tasks" },
  );
  assert.deepEqual(
    contextualArguments(
      "describe_collection",
      { collection: null },
      tableContext,
      propsFor("describe_collection"),
    ),
    { collection: "tasks" },
  );
  assert.deepEqual(
    contextualArguments(
      "read_item",
      { collection: "tasks", id: "1", fields: ["title"] },
      tableContext,
      propsFor("read_item"),
    ),
    { collection: "tasks", id: "1", fields: ["title"] },
  );
  assert.deepEqual(
    contextualArguments(
      "create_item",
      {
        collection: "tasks",
        values: { title: "New" },
        operationId: "op_1234567890123456",
      },
      tableContext,
      propsFor("create_item"),
    ),
    {
      collection: "tasks",
      values: { title: "New" },
      operationId: "op_1234567890123456",
    },
  );
  assert.deepEqual(
    contextualArguments(
      "validate_filter",
      { collection: "tasks" },
      tableContext,
      propsFor("validate_filter"),
    ),
    { collection: "tasks" },
  );

  // count_items & aggregate_items inherit only q and filter (never sort/direction/order).
  assert.deepEqual(
    contextualArguments(
      "count_items",
      { collection: "tasks" },
      tableContext,
      propsFor("count_items"),
    ),
    {
      collection: "tasks",
      q: "urgent",
      filter: '{"logic":"and","children":[]}',
    },
  );
  assert.deepEqual(
    contextualArguments(
      "aggregate_items",
      { collection: "tasks", metrics: [{ operation: "count", field: null }] },
      tableContext,
      propsFor("aggregate_items"),
    ),
    {
      collection: "tasks",
      metrics: [{ operation: "count", field: null }],
      q: "urgent",
      filter: '{"logic":"and","children":[]}',
    },
  );

  // search_items inherits q, filter, sort, direction, and order when null or omitted.
  assert.deepEqual(
    contextualArguments(
      "search_items",
      { collection: "tasks", fields: ["title"] },
      tableContext,
      propsFor("search_items"),
    ),
    {
      collection: "tasks",
      fields: ["title"],
      q: "urgent",
      filter: '{"logic":"and","children":[]}',
      sort: "title",
      direction: "desc",
      order: "field",
    },
  );
});
