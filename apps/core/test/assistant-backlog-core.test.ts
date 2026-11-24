import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import type { Knex } from "knex";
import { AccessDeniedError, type Access } from "../src/permissions/access.js";
import { ItemError } from "../src/items/validation.js";
import { toolDefinitions } from "../src/tools/tool-definitions.js";
import {
  executeListPolicies,
  executeListUsers,
  executeMyPermissions,
  formatUserDisplayName,
  matchesNormalizedSearch,
  parseListPoliciesInput,
  parseListUsersInput,
} from "../src/tools/directory-tools.js";
import { createToolSession } from "../src/tools/session.js";
import { ToolArgumentError, toolErrorResult } from "../src/tools/errors.js";
import { assistantToolDefinitions } from "../src/assistant/tool-contract.js";
import { contextualArguments } from "../src/assistant/context-tools.js";
import { strictToolSchema } from "../src/assistant/tool-strict-schema.js";
import {
  SessionSchemaCache,
  computeCollectionSchemaRevision,
  type LoadedCollectionSchema,
} from "../src/assistant/session-schema-cache.js";
import {
  WriteProposalStore,
  parseProposeWriteInput,
} from "../src/assistant/write-proposals.js";
import { selectRecordSummaryFields } from "../src/assistant/widgets.js";
import {
  parseConversationTitle,
  renameConversation,
} from "../src/assistant/history-repository.js";
import { registerAssistantHistoryRoutes } from "../src/assistant/history-routes.js";
import { buildAssistantInstructions } from "../src/assistant/instructions.js";
import { createProgress } from "../src/assistant/progress.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { AssistantService } from "../src/assistant/service.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { parseAssistantInput } from "../src/assistant/validation.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const COLLECTION_ID = "44444444-4444-4444-8444-444444444444";

function makeAccess(overrides: Partial<Access> = {}): Access {
  return {
    principal: {
      kind: "user",
      id: USER_ID,
      email: "manager@example.test",
      superuser: false,
      sessionId: SESSION_ID,
    },
    grants: new Map([
      ["tasks:read", ["*"]],
      ["tasks:create", ["title", "status"]],
      ["tasks:update", ["title", "status"]],
    ]),
    ...overrides,
  };
}

function makeMockSchema(
  extraFields: [string, Record<string, unknown>][] = [],
): LoadedCollectionSchema {
  return {
    settings: {
      internalId: COLLECTION_ID,
      name: "tasks",
      displayName: "Задачи",
      primaryKey: { name: "id", type: "serial" },
      timestamps: { createdAt: true, updatedAt: false },
      mcp: { enabled: true, description: null },
      state: null,
      sourceKind: "table",
      sourceSchemaHash: null,
    },
    fields: new Map([
      [
        "title",
        {
          name: "title",
          type: "text",
          required: true,
          nullable: false,
          presentation: { label: "Название" },
        },
      ],
      [
        "status",
        {
          name: "status",
          type: "text",
          required: false,
          nullable: true,
          presentation: { label: "Статус" },
        },
      ],
      ...extraFields,
    ]),
  } as unknown as LoadedCollectionSchema;
}

test("directory & interactive tools are registered with proper strict schemas and RBAC gating", () => {
  for (const name of ["my_permissions", "list_users", "list_policies"]) {
    const def = toolDefinitions.find((t) => t.name === name);
    assert.ok(def, `Missing ${name} in toolDefinitions`);
    assert.equal(strictToolSchema(def.parameters), true);
    assert.equal(def.annotations?.readOnlyHint, true);
    assert.equal(def.annotations?.destructiveHint, false);
  }

  const fullTools = assistantToolDefinitions(toolDefinitions, true);
  assert.ok(fullTools.some((t) => t.name === "present_record"));
  assert.ok(fullTools.some((t) => t.name === "present_form"));
  assert.ok(fullTools.some((t) => t.name === "propose_write"));
  assert.equal(
    strictToolSchema(
      fullTools.find((t) => t.name === "present_record")!.parameters,
    ),
    true,
  );
  assert.equal(
    strictToolSchema(
      fullTools.find((t) => t.name === "propose_write")!.parameters,
    ),
    false,
  );

  // Read-only definitions must NOT advertise present_form or propose_write.
  const readOnlyDefs = toolDefinitions.filter(
    (t) => !["create_item", "prepare_update", "update_item"].includes(t.name),
  );
  const readOnlyAssistantTools = assistantToolDefinitions(readOnlyDefs, false);
  assert.ok(readOnlyAssistantTools.some((t) => t.name === "present_record"));
  assert.equal(
    readOnlyAssistantTools.some((t) => t.name === "present_form"),
    false,
  );
  assert.equal(
    readOnlyAssistantTools.some((t) => t.name === "propose_write"),
    false,
  );
});

test("tool-contract and contextualArguments NEVER inject collection/table args into directory or widget tools", () => {
  const withTable = assistantToolDefinitions(toolDefinitions, true);
  const tableContext = {
    page: "items" as const,
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

  const untouchedTools: [string, Record<string, unknown>][] = [
    ["my_permissions", {}],
    ["list_users", { q: null, status: null, limit: null }],
    ["list_policies", { q: null, delegatableOnly: null }],
    ["present_record", { collection: "clients", id: "42", summary: null }],
    [
      "present_form",
      { collection: "clients", values: { name: "Acme" }, summary: null },
    ],
    [
      "propose_write",
      {
        collection: "clients",
        operation: "create",
        values: { name: "Acme" },
      },
    ],
  ];

  for (const [name, args] of untouchedTools) {
    const def = withTable.find((t) => t.name === name)!;
    assert.ok(def, `Expected ${name} in assistantToolDefinitions`);
    assert.ok(
      !def.description.includes("collection=null uses the current page"),
      `${name} should not get page-default collection rewrite`,
    );
    assert.deepEqual(
      contextualArguments(name, args, tableContext, def.parameters.properties),
      args,
    );
  }
});

test("parseProposeWriteInput validates create/update shapes and rejects invalid inputs", () => {
  assert.deepEqual(
    parseProposeWriteInput({
      collection: "tasks",
      operation: "create",
      values: { title: "New task" },
      summary: "  Создать задачу  ",
    }),
    {
      collection: "tasks",
      operation: "create",
      id: null,
      values: { title: "New task" },
      expectedValues: null,
      summary: "Создать задачу",
    },
  );

  assert.deepEqual(
    parseProposeWriteInput({
      collection: "tasks",
      operation: "update",
      id: "15",
      values: { status: "done" },
      expectedValues: { status: "open" },
    }),
    {
      collection: "tasks",
      operation: "update",
      id: "15",
      values: { status: "done" },
      expectedValues: { status: "open" },
      summary: null,
    },
  );

  const invalidCases: [unknown, string][] = [
    [
      { collection: "tasks", operation: "delete", values: { title: "x" } },
      "operation",
    ],
    [
      { collection: "tasks", operation: "update", values: { title: "x" } },
      "id",
    ],
    [
      {
        collection: "tasks",
        operation: "create",
        id: "1",
        values: { title: "x" },
      },
      "id",
    ],
    [{ collection: "tasks", operation: "create", values: {} }, "values"],
    [
      {
        collection: "tasks",
        operation: "create",
        values: { title: "x" },
        expectedValues: { title: "y" },
      },
      "expectedValues",
    ],
    [
      {
        collection: "tasks",
        operation: "create",
        values: { title: "x" },
        summary: "a".repeat(301),
      },
      "summary",
    ],
  ];
  for (const [payload, argName] of invalidCases) {
    assert.throws(
      () => parseProposeWriteInput(payload),
      (err: unknown) => {
        assert.ok(err instanceof ToolArgumentError);
        assert.equal(err.code, "INVALID_ARGUMENTS");
        assert.deepEqual(err.argumentNames, [argName]);
        return true;
      },
    );
  }
});

test("WriteProposalStore enforces owner isolation, live RBAC on confirm, idempotency, rejection, and expiry", async () => {
  let nowMs = 1_700_000_000_000;
  let writeExecutions = 0;
  let shouldDeny = false;
  let shouldConflict = false;

  const store = new WriteProposalStore({
    ttlMs: 60_000,
    now: () => nowMs,
    executeWrite: async (_db, _access, collection, _colId, tool, input) => {
      writeExecutions++;
      if (shouldDeny) throw new AccessDeniedError();
      if (shouldConflict) {
        throw new ItemError("Item changed", 409, "ITEM_CHANGED");
      }
      assert.equal(collection, "tasks");
      assert.equal(tool, "update_item");
      assert.deepEqual(input.expectedValues, { status: "open" });
      return { collection, id: "42", applied: true, action: "update" };
    },
  });

  // Seed a proposal via internal Map test helper by running propose with a minimal mock trx or testing confirm lifecycle:
  // Use a real lightweight Knex-like mock transaction for propose? Even better, test propose validation + confirm end-to-end!
  const proposalId = randomUUID();
  const internalMap = (
    store as unknown as { proposals: Map<string, Record<string, unknown>> }
  ).proposals;
  internalMap.set(proposalId, {
    id: proposalId,
    ownerId: USER_ID,
    sessionId: SESSION_ID,
    collection: "tasks",
    collectionId: COLLECTION_ID,
    collectionDisplayName: "Задачи",
    operation: "update",
    recordId: "42",
    values: { status: "done" },
    expectedValues: { status: "open" },
    summary: "Закрыть задачу",
    diff: [{ field: "status", label: "Статус", before: "open", after: "done" }],
    status: "pending",
    confirmedRecordId: null,
    createdAt: nowMs,
    expiresAt: nowMs + 60_000,
    inFlight: false,
  });

  const ownerAccess = makeAccess();
  const otherAccess = makeAccess({
    principal: { ...makeAccess().principal, id: OTHER_USER_ID },
  });

  // Another user CANNOT confirm or reject someone else's proposal.
  await assert.rejects(
    store.confirm({} as Knex, otherAccess, proposalId),
    (err: unknown) => err instanceof ItemError && err.statusCode === 404,
  );
  assert.throws(
    () => store.reject(otherAccess, proposalId),
    (err: unknown) => err instanceof ItemError && err.statusCode === 404,
  );
  assert.equal(writeExecutions, 0);

  // Live RBAC denial prevents confirmation and leaves proposal unconfirmed.
  shouldDeny = true;
  await assert.rejects(
    store.confirm({} as Knex, ownerAccess, proposalId),
    AccessDeniedError,
  );
  assert.equal(store.getForOwner(USER_ID, proposalId)?.status, "pending");
  shouldDeny = false;

  // Optimistic lock conflict returns 409 ITEM_CHANGED and leaves proposal pending.
  shouldConflict = true;
  await assert.rejects(
    store.confirm({} as Knex, ownerAccess, proposalId),
    (err: unknown) =>
      err instanceof ItemError &&
      err.statusCode === 409 &&
      err.code === "ITEM_CHANGED",
  );
  shouldConflict = false;

  // Successful confirm executes once and marks confirmed.
  const confirmed = await store.confirm({} as Knex, ownerAccess, proposalId);
  assert.deepEqual(confirmed, {
    status: "confirmed",
    proposalId,
    recordId: "42",
    collection: "tasks",
  });
  assert.equal(writeExecutions, 3);

  // Idempotent second confirm does NOT re-execute the write!
  const confirmedAgain = await store.confirm(
    {} as Knex,
    ownerAccess,
    proposalId,
  );
  assert.deepEqual(confirmedAgain, confirmed);
  assert.equal(writeExecutions, 3);

  // Cannot reject an already confirmed proposal.
  assert.throws(
    () => store.reject(ownerAccess, proposalId),
    (err: unknown) => err instanceof ItemError && err.statusCode === 409,
  );

  // Rejected proposal cannot be confirmed.
  const rejectId = randomUUID();
  internalMap.set(rejectId, {
    ...internalMap.get(proposalId)!,
    id: rejectId,
    status: "pending",
    confirmedRecordId: null,
  });
  assert.deepEqual(store.reject(ownerAccess, rejectId), {
    status: "rejected",
    proposalId: rejectId,
  });
  await assert.rejects(
    store.confirm({} as Knex, ownerAccess, rejectId),
    (err: unknown) =>
      err instanceof ItemError &&
      err.statusCode === 409 &&
      err.code === "PROPOSAL_REJECTED",
  );

  // Expired proposal fails with 409 PROPOSAL_EXPIRED.
  const expiredId = randomUUID();
  internalMap.set(expiredId, {
    ...internalMap.get(proposalId)!,
    id: expiredId,
    status: "pending",
    confirmedRecordId: null,
    expiresAt: nowMs + 1000,
  });
  nowMs += 2000;
  await assert.rejects(
    store.confirm({} as Knex, ownerAccess, expiredId),
    (err: unknown) =>
      err instanceof ItemError &&
      err.statusCode === 409 &&
      err.code === "PROPOSAL_EXPIRED",
  );
});

test("selectRecordSummaryFields caps at 4 readable fields, excludes PK and unprojected secret fields", () => {
  const schemaFields = new Map([
    [
      "title",
      { name: "title", type: "text", presentation: { label: "Название" } },
    ],
    [
      "status",
      { name: "status", type: "text", presentation: { label: "Статус" } },
    ],
    [
      "secret",
      { name: "secret", type: "text", presentation: { label: "Секрет" } },
    ],
    [
      "owner",
      { name: "owner", type: "text", presentation: { label: "Ответственный" } },
    ],
    [
      "priority",
      { name: "priority", type: "text", presentation: { label: "Приоритет" } },
    ],
    [
      "due_date",
      { name: "due_date", type: "date", presentation: { label: "Срок" } },
    ],
    ["meta", { name: "meta", type: "json", presentation: { label: "JSON" } }],
    [
      "empty_note",
      { name: "empty_note", type: "text", presentation: { label: "Заметка" } },
    ],
  ]);

  // Notice "secret" is NOT in projectedRow (stripped by RBAC projectRow).
  const projected = {
    id: "42",
    title: "Подготовить релиз",
    status: "В работе",
    owner: "Иван",
    priority: "Высокий",
    due_date: "2026-12-01",
    meta: { a: 1 },
    empty_note: null,
  };

  const fields = selectRecordSummaryFields(
    schemaFields,
    projected,
    "id",
    "Подготовить релиз",
  );
  assert.equal(fields.length, 4);
  assert.equal(
    fields.some((f) => f.field === "secret" || f.field === "id"),
    false,
  );
  // Non-null, non-title, non-JSON fields come first.
  assert.deepEqual(
    fields.map((f) => f.field),
    ["status", "owner", "priority", "due_date"],
  );
  assert.equal(fields[0].label, "Статус");
  assert.equal(fields[0].value, "В работе");
});

test("directory tool helpers normalize ё/е and validate input arguments", () => {
  assert.equal(matchesNormalizedSearch("Артём Семёнов", "артем"), true);
  assert.equal(matchesNormalizedSearch("Секретный отдел", "секрет"), true);
  assert.equal(matchesNormalizedSearch("Редактор", "админ"), false);

  assert.equal(
    formatUserDisplayName({
      display_name: "  Артём  ",
      first_name: "A",
      last_name: "B",
    }),
    "Артём",
  );
  assert.equal(
    formatUserDisplayName({
      display_name: null,
      first_name: "Иван",
      last_name: "Петров",
    }),
    "Иван Петров",
  );

  assert.deepEqual(
    parseListUsersInput({ q: "  Иван ", status: null, limit: null }),
    {
      q: "Иван",
      status: null,
      limit: 20,
    },
  );
  assert.throws(
    () => parseListUsersInput({ status: "deleted" }),
    ToolArgumentError,
  );
  assert.throws(() => parseListUsersInput({ limit: 100 }), ToolArgumentError);

  assert.deepEqual(
    parseListPoliciesInput({ q: "менеджер", delegatableOnly: true }),
    { q: "менеджер", delegatableOnly: true },
  );
  assert.throws(
    () => parseListPoliciesInput({ delegatableOnly: "yes" }),
    ToolArgumentError,
  );
});

test("executeMyPermissions, executeListUsers, and executeListPolicies enforce RBAC strictly", async () => {
  const policyA = {
    id: "aaaa1111-1111-4111-8111-111111111111",
    name: "Менеджер",
  };
  const policyB = {
    id: "bbbb2222-2222-4222-8222-222222222222",
    name: "Супер-админ",
  };

  function mockDbForSettings(options: {
    sections: { section: string; action: "read" | "update" }[];
    delegatedIds: string[];
    collections?: { name: string; display_name: string | null }[];
    users?: Record<string, unknown>[];
  }) {
    const db = ((table: string) => {
      const state: { whereIn?: unknown[]; whereStatus?: string } = {};
      const builder: Record<string, unknown> = {
        withSchema: () => builder,
        join: () => builder,
        where: (colOrObj: unknown, val?: unknown) => {
          if (colOrObj === "status" && typeof val === "string") {
            state.whereStatus = val;
          }
          return builder;
        },
        whereNull: () => builder,
        whereNotNull: () => builder,
        whereRaw: () => builder,
        whereIn: (_col: string, ids: unknown[]) => {
          state.whereIn = ids;
          return builder;
        },
        orWhereRaw: () => builder,
        select: () => builder,
        distinct: () => Promise.resolve(options.sections),
        pluck: () => Promise.resolve(options.delegatedIds),
        orderBy: () => builder,
        orderByRaw: () => builder,
        limit: () => builder,
        offset: () => builder,
        clone: () => builder,
        count: () => ({
          first: async () => ({
            total: String(
              (options.users ?? []).filter((u) => u.status === "active").length,
            ),
          }),
        }),
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          try {
            if (table.includes("asmblyr_collections")) {
              resolve(options.collections ?? []);
              return;
            }
            if (table.includes("asmblyr_policies")) {
              const all = [policyA, policyB];
              resolve(
                state.whereIn
                  ? all.filter((p) => state.whereIn!.includes(p.id))
                  : all,
              );
              return;
            }
            if (table.includes("asmblyr_users")) {
              let list = options.users ?? [];
              if (state.whereStatus) {
                list = list.filter((u) => u.status === state.whereStatus);
              }
              resolve(list);
              return;
            }
            resolve([]);
          } catch (err) {
            reject(err);
          }
        },
      };
      return builder;
    }) as unknown as Knex;
    (db as unknown as { raw: (sql: string) => string }).raw = (sql: string) =>
      sql;
    return db;
  }

  // 1. my_permissions for delegated manager with row-scoped tasks
  const managerAccess = makeAccess({
    rowRules: new Map([["tasks:read", [{ fields: ["*"], filter: null }]]]),
  });
  const managerDb = mockDbForSettings({
    sections: [
      { section: "policies", action: "read" },
      { section: "users", action: "read" },
      { section: "users", action: "update" },
    ],
    delegatedIds: [policyA.id],
    collections: [
      { name: "tasks", display_name: "Задачи" },
      { name: "secrets", display_name: "Секреты" },
    ],
  });
  const perms = await executeMyPermissions(managerDb, managerAccess, {});
  assert.equal(perms.superuser, false);
  assert.deepEqual(perms.collections, [
    {
      name: "tasks",
      displayName: "Задачи",
      actions: ["read", "create", "update"],
      rowScoped: true,
    },
  ]);
  assert.deepEqual(perms.settingsSections, {
    readable: ["users", "policies"],
    editable: ["users"],
  });
  assert.deepEqual(perms.delegatablePolicies, [policyA]);

  // 2. list_policies for delegated manager distinguishes delegatable vs non-delegatable
  const allPolicies = await executeListPolicies(managerDb, managerAccess, {
    q: null,
    delegatableOnly: false,
  });
  assert.deepEqual(allPolicies.policies, [
    { ...policyA, description: null, delegatable: true },
    { ...policyB, description: null, delegatable: false },
  ]);
  const delegatableOnly = await executeListPolicies(managerDb, managerAccess, {
    q: null,
    delegatableOnly: true,
  });
  assert.deepEqual(delegatableOnly.policies, [
    { ...policyA, description: null, delegatable: true },
  ]);

  // 3. list_policies WITHOUT policies read access -> AccessDeniedError -> PERMISSION_DENIED
  const regularDb = mockDbForSettings({
    sections: [],
    delegatedIds: [],
    users: [
      { id: USER_ID, label: "Иван · ivan@example.test", status: "active" },
      { id: OTHER_USER_ID, label: "Отключённый", status: "disabled" },
    ],
  });
  await assert.rejects(
    executeListPolicies(regularDb, makeAccess(), {
      q: null,
      delegatableOnly: null,
    }),
    (err: unknown) => {
      assert.ok(err instanceof AccessDeniedError);
      assert.equal(
        (toolErrorResult(err) as { code: string }).code,
        "PERMISSION_DENIED",
      );
      return true;
    },
  );

  // 4. list_users WITHOUT users read access -> minimal reference projection & never disabled users
  const refUsers = await executeListUsers(regularDb, makeAccess(), {
    q: null,
    status: null,
    limit: 20,
  });
  assert.equal(refUsers.scope, "reference");
  assert.deepEqual(refUsers.users, [
    { id: USER_ID, label: "Иван · ivan@example.test" },
  ]);
  const blockedDisabled = await executeListUsers(regularDb, makeAccess(), {
    q: null,
    status: "disabled",
    limit: 20,
  });
  assert.equal(blockedDisabled.scope, "reference");
  assert.deepEqual(blockedDisabled.users, []);

  // 5. list_users WITH users read access -> full directory fields (no credentials!)
  const dirDb = mockDbForSettings({
    sections: [{ section: "users", action: "read" }],
    delegatedIds: [],
    users: [
      {
        id: USER_ID,
        email: "artem@example.test",
        display_name: "Артём",
        first_name: null,
        last_name: null,
        status: "active",
      },
    ],
  });
  const dirUsers = await executeListUsers(dirDb, managerAccess, {
    q: "артем",
    status: "active",
    limit: 10,
  });
  assert.equal(dirUsers.scope, "directory");
  assert.deepEqual(dirUsers.users, [
    {
      id: USER_ID,
      displayName: "Артём",
      email: "artem@example.test",
      status: "active",
    },
  ]);
});

test("SessionSchemaCache caches described collections across turns and invalidates on schema revision change, user switch, or TTL", async () => {
  let nowMs = 1_700_000_000_000;
  const cache = new SessionSchemaCache({ ttlMs: 10_000, now: () => nowMs });
  const access = makeAccess();

  let currentSchema = makeMockSchema();
  const resolveRevision = async (collection: string, acc: Access) => ({
    collectionId: currentSchema.settings.internalId,
    revision: computeCollectionSchemaRevision(currentSchema, acc, collection),
  });

  const turn1Schemas = cache.forSession(
    SESSION_ID,
    USER_ID,
    {} as Knex,
    async () => access,
    resolveRevision,
  );
  assert.equal(await turn1Schemas.load("tasks"), undefined);
  await turn1Schemas.save("tasks", COLLECTION_ID);

  // Follow-up turn in the same session hits cache without SCHEMA_REQUIRED!
  const turn2Schemas = cache.forSession(
    SESSION_ID,
    USER_ID,
    {} as Knex,
    async () => access,
    resolveRevision,
  );
  assert.equal(await turn2Schemas.load("tasks"), COLLECTION_ID);

  // Verify createToolSession skips SCHEMA_REQUIRED when schemaCache has a hit!
  let reachedExecution = false;
  const fakeDb = {
    transaction: async () => {
      reachedExecution = true;
      return { collection: "tasks", count: "5" };
    },
  } as unknown as Knex;
  const cachedSession = createToolSession(
    fakeDb,
    access,
    async () => access,
    new Map(),
    { schemas: turn2Schemas },
  );
  const countRes = await cachedSession.execute("count_items", {
    collection: "tasks",
  });
  assert.equal(reachedExecution, true);
  assert.deepEqual(countRes, { collection: "tasks", count: "5" });

  // Different principal or different session must NOT see the cache entry.
  const otherPrincipalSchemas = cache.forSession(
    SESSION_ID,
    OTHER_USER_ID,
    {} as Knex,
    async () => access,
    resolveRevision,
  );
  assert.equal(await otherPrincipalSchemas.load("tasks"), undefined);

  const otherSessionSchemas = cache.forSession(
    randomUUID(),
    USER_ID,
    {} as Knex,
    async () => access,
    resolveRevision,
  );
  assert.equal(await otherSessionSchemas.load("tasks"), undefined);

  // Schema change (new field added) changes revision -> cache invalidates automatically!
  currentSchema = makeMockSchema([
    [
      "priority",
      {
        name: "priority",
        type: "text",
        required: false,
        nullable: true,
        presentation: { label: "Приоритет" },
      },
    ],
  ]);
  assert.equal(await turn2Schemas.load("tasks"), undefined);

  // Save again, then expire TTL -> cache miss.
  await turn2Schemas.save("tasks", COLLECTION_ID);
  assert.equal(await turn2Schemas.load("tasks"), COLLECTION_ID);
  nowMs += 11_000;
  assert.equal(await turn2Schemas.load("tasks"), undefined);
});

test("session rename validates title 1..120 chars, enforces owner, and exposes PATCH /assistant/sessions/:id and /assistant/conversations/:id", async () => {
  assert.equal(
    parseConversationTitle("  Сводка по сделкам  "),
    "Сводка по сделкам",
  );
  assert.equal(parseConversationTitle("a".repeat(120)), "a".repeat(120));
  for (const invalid of ["", "   ", "a".repeat(121), "bad\0title", 123, null]) {
    assert.throws(() => parseConversationTitle(invalid));
  }

  const createdAt = new Date("2026-11-24T00:00:00Z");
  const rows = new Map<string, Record<string, unknown>>([
    [
      SESSION_ID,
      {
        id: SESSION_ID,
        user_id: USER_ID,
        title: "Old title",
        created_at: createdAt,
        updated_at: createdAt,
        next_sequence: 2,
        compaction_count: 0,
        active_message_id: null,
        busy_until: null,
      },
    ],
  ]);

  const makeTrx = () => {
    const trx = (() => {
      let filter: { id?: string; user_id?: string } = {};
      const q = {
        withSchema: () => q,
        where: (whereObj: { id?: string; user_id?: string }) => {
          filter = whereObj;
          return q;
        },
        forUpdate: () => q,
        first: async () => {
          const row = filter.id ? rows.get(filter.id) : undefined;
          return row && row.user_id === filter.user_id ? row : undefined;
        },
        update: (patch: Record<string, unknown>) => ({
          returning: async () => {
            const row = filter.id ? rows.get(filter.id) : undefined;
            if (!row || row.user_id !== filter.user_id) return [];
            const next = { ...row, ...patch };
            rows.set(filter.id!, next);
            return [next];
          },
        }),
      };
      return q;
    }) as unknown as Knex;
    (trx as unknown as { transaction: Knex["transaction"] }).transaction =
      (async (cb: (t: Knex.Transaction) => Promise<unknown>) =>
        cb(trx as unknown as Knex.Transaction)) as Knex["transaction"];
    return trx;
  };

  const db = makeTrx();
  const renamed = await renameConversation(
    db,
    USER_ID,
    SESSION_ID,
    "  Новое имя  ",
  );
  assert.equal(renamed.id, SESSION_ID);
  assert.equal(renamed.title, "Новое имя");

  // Wrong owner gets 404 assistant_conversation_unavailable.
  await assert.rejects(
    renameConversation(db, OTHER_USER_ID, SESSION_ID, "Чужая сессия"),
    { code: "assistant_conversation_unavailable", statusCode: 404 },
  );

  // Fastify route wiring for both PATCH /assistant/sessions/:id and PATCH /assistant/conversations/:id.
  const app = Fastify();
  registerAssistantHistoryRoutes(app, db, async (authHeader) => ({
    principal: { id: authHeader === "Bearer other" ? OTHER_USER_ID : USER_ID },
  }));

  const resSessions = await app.inject({
    method: "PATCH",
    url: `/assistant/sessions/${SESSION_ID}`,
    payload: { title: "Через sessions" },
  });
  assert.equal(resSessions.statusCode, 200);
  assert.equal(resSessions.json().data.title, "Через sessions");

  const resConversations = await app.inject({
    method: "PATCH",
    url: `/assistant/conversations/${SESSION_ID}`,
    payload: { title: "Через conversations" },
  });
  assert.equal(resConversations.statusCode, 200);
  assert.equal(resConversations.json().data.title, "Через conversations");

  const resForbiddenOwner = await app.inject({
    method: "PATCH",
    url: `/assistant/sessions/${SESSION_ID}`,
    headers: { authorization: "Bearer other" },
    payload: { title: "Чужое" },
  });
  assert.equal(resForbiddenOwner.statusCode, 404);
  await app.close();
});

test("provider promotes present_record and present_form without extra generation, and service returns cards", async () => {
  const config = assistantConfigFromEnv({
    OPENAI_API_KEY: "test",
    OPENAI_API_MODEL: "test-model",
  })!;
  const input = parseAssistantInput(
    { messages: [{ role: "user", content: "Открой запись 42" }] },
    config,
  );
  let calls = 0;
  const provider = createAssistantProvider(
    { ...config, api: "chat-completions" },
    async () => {
      calls++;
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: "Вот карточка записи и форма создания.",
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: {
                    name: "present_record",
                    arguments: JSON.stringify({
                      collection: "tasks",
                      id: "42",
                      summary: null,
                    }),
                  },
                },
                {
                  id: "c2",
                  type: "function",
                  function: {
                    name: "present_form",
                    arguments: JSON.stringify({
                      collection: "tasks",
                      values: { title: "Новая" },
                      summary: null,
                    }),
                  },
                },
              ],
            },
          },
        ],
      });
    },
  );

  const service = new AssistantService(config, provider);
  const recordCard = {
    type: "record" as const,
    collection: "tasks",
    collectionId: COLLECTION_ID,
    collectionDisplayName: "Задачи",
    recordId: "42",
    title: "Задача 42",
    summary: null,
    fields: [{ field: "status", label: "Статус", value: "open" }],
  };
  const formCard = {
    type: "form" as const,
    collection: "tasks",
    collectionId: COLLECTION_ID,
    collectionDisplayName: "Задачи",
    summary: null,
    values: { title: "Новая" },
    fields: [{ field: "title", label: "Название", value: "Новая" }],
  };
  const writeCard = {
    type: "write_proposal" as const,
    proposalId: randomUUID(),
    collection: "tasks",
    collectionDisplayName: "Задачи",
    operation: "create" as const,
    recordId: null,
    summary: "Создать задачу",
    diff: [{ field: "title", label: "Название", before: null, after: "Новая" }],
    status: "pending" as const,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  const result = await service.respond(
    USER_ID,
    { messages: [{ role: "user", content: input.messages[0].content }] },
    undefined,
    undefined,
    undefined,
    async () => ({
      context: { page: "home" },
      definitions: assistantToolDefinitions(toolDefinitions, false),
      proposals: [],
      writeProposals: [writeCard],
      records: [recordCard],
      forms: [formCard],
      execute: async () => ({ presented: true, requiresUserClick: true }),
    }),
  );

  assert.equal(calls, 1);
  assert.equal(result.content, "Вот карточка записи и форма создания.");
  assert.deepEqual(result.records, [recordCard]);
  assert.deepEqual(result.forms, [formCard]);
  assert.deepEqual(result.writeProposals, [writeCard]);
});

test("instructions and progress labels document all new assistant core features", () => {
  const instructions = buildAssistantInstructions(null, { page: "home" });
  for (const token of [
    "propose_write",
    "present_record",
    "present_form",
    "my_permissions",
    "list_users",
    "list_policies",
    "Открыть запись",
    "Открыть форму создания",
    "Подтвердить",
  ]) {
    assert.ok(instructions.includes(token), `Instructions missing "${token}"`);
  }

  const labels: string[] = [];
  const progress = createProgress((next) => labels.push(next.label));
  for (const name of [
    "my_permissions",
    "list_users",
    "list_policies",
    "propose_write",
    "present_record",
    "present_form",
  ]) {
    progress.tool(name);
  }
  assert.deepEqual(labels, [
    "Проверяю доступные права",
    "Ищу пользователей",
    "Проверяю политики доступа",
    "Готовлю подтверждение изменения",
    "Готовлю карточку записи",
    "Готовлю форму создания",
  ]);
});
