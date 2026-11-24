import assert from "node:assert/strict";
import test from "node:test";
import knex, { type Knex } from "knex";
import { replaceUserPolicies } from "../src/policies/assignment-repository.js";
import {
  parseConditionPreviewInput,
  previewPolicyCondition,
} from "../src/policies/condition-preview.js";
import {
  PolicyInputError,
  PolicyNotFoundError,
} from "../src/policies/validation.js";
import { AccessDeniedError } from "../src/permissions/access.js";
import { inviteUser, inviteUsersBulk } from "../src/auth/invitations.js";
import {
  listUsersDirectory,
  sortDepartmentLabels,
} from "../src/auth/user-directory.js";
import {
  AuthConflictError,
  AuthInputError,
  UserNotFoundError,
  parseBulkInviteInput,
  parseInviteInput,
  parseUsersListQuery,
} from "../src/auth/validation.js";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const MANAGER_ID = "00000000-0000-4000-8000-000000000002";
const TARGET_ID = "00000000-0000-4000-8000-000000000003";
const MISSING_ID = "00000000-0000-4000-8000-000000000099";

const POLICY_A = "10000000-0000-4000-8000-000000000001";
const POLICY_B = "10000000-0000-4000-8000-000000000002";
const POLICY_ADMIN_ONLY = "10000000-0000-4000-8000-000000000003";
const POLICY_MISSING = "10000000-0000-4000-8000-000000000099";

interface MockAccessState {
  users: {
    id: string;
    email: string;
    status: "active" | "disabled";
    superuser: boolean;
  }[];
  policies: { id: string; name: string }[];
  userPolicies: { user_id: string; policy_id: string }[];
  delegations: { user_id: string; policy_id: string }[];
  invitations: { user_id: string; token_hash: string; expires_at: Date }[];
  settingsSectionsByUser: Record<string, { section: string; action: string }[]>;
  securityEvents: Record<string, unknown>[];
  forShareTables: string[];
}

function createAccessMockDb(state: MockAccessState): Knex {
  let nextUserSeq = 10;
  const trx = Object.assign(
    (table: string) => {
      const normalized = table.replace(/^public\./, "").split(" as ")[0];
      let filters: Record<string, unknown> = {};
      let inFilter: { col: string; values: unknown[] } | null = null;
      let notInFilter: { col: string; values: unknown[] } | null = null;

      const query = {
        withSchema() {
          return query;
        },
        join() {
          return query;
        },
        where(arg: Record<string, unknown> | string, value?: unknown) {
          if (typeof arg === "string") {
            filters[arg] = value;
          } else {
            filters = { ...filters, ...arg };
          }
          return query;
        },
        whereIn(col: string, values: unknown[]) {
          inFilter = { col, values };
          return query;
        },
        whereNotIn(col: string, values: unknown[]) {
          notInFilter = { col, values };
          return query;
        },
        whereNull() {
          return query;
        },
        whereNotNull() {
          return query;
        },
        forUpdate() {
          return query;
        },
        forShare() {
          state.forShareTables.push(normalized);
          return query;
        },
        orderBy() {
          return query;
        },
        distinct() {
          if (normalized === "asmblyr_user_policies") {
            const uid = String(filters["assignment.user_id"] ?? "");
            return Promise.resolve(state.settingsSectionsByUser[uid] ?? []);
          }
          return Promise.resolve([]);
        },
        pluck(column: string) {
          if (normalized === "asmblyr_user_policy_delegations") {
            return Promise.resolve(
              state.delegations
                .filter((row) => row.user_id === filters.user_id)
                .map((row) => row[column as keyof typeof row]),
            );
          }
          if (normalized === "asmblyr_user_policies") {
            return Promise.resolve(
              state.userPolicies
                .filter((row) => row.user_id === filters.user_id)
                .map((row) => row[column as keyof typeof row]),
            );
          }
          if (normalized === "asmblyr_policies") {
            const rows = inFilter
              ? state.policies.filter((p) =>
                  inFilter!.values.includes(p[inFilter!.col as keyof typeof p]),
                )
              : state.policies;
            return Promise.resolve(
              rows.map((row) => row[column as keyof typeof row]),
            );
          }
          return Promise.resolve([]);
        },
        first() {
          if (normalized === "asmblyr_users") {
            const match = state.users.find((user) =>
              Object.entries(filters).every(
                ([key, val]) => user[key as keyof typeof user] === val,
              ),
            );
            return Promise.resolve(match);
          }
          if (normalized === "asmblyr_policies") {
            const match = state.policies.find((p) => p.id === filters.id);
            return Promise.resolve(match);
          }
          return Promise.resolve(undefined);
        },
        delete() {
          if (normalized === "asmblyr_user_policies") {
            const before = state.userPolicies.length;
            state.userPolicies = state.userPolicies.filter((row) => {
              if (row.user_id !== filters.user_id) {
                return true;
              }
              if (
                notInFilter &&
                notInFilter.col === "policy_id" &&
                notInFilter.values.includes(row.policy_id)
              ) {
                return true;
              }
              return false;
            });
            return Promise.resolve(before - state.userPolicies.length);
          }
          return Promise.resolve(0);
        },
        insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
          const rows = Array.isArray(payload) ? payload : [payload];
          const insertResult = {
            onConflict() {
              return {
                ignore() {
                  if (normalized === "asmblyr_user_policies") {
                    for (const row of rows) {
                      const uid = String(row.user_id);
                      const pid = String(row.policy_id);
                      if (
                        !state.userPolicies.some(
                          (existing) =>
                            existing.user_id === uid &&
                            existing.policy_id === pid,
                        )
                      ) {
                        state.userPolicies.push({
                          user_id: uid,
                          policy_id: pid,
                        });
                      }
                    }
                  }
                  return Promise.resolve([]);
                },
              };
            },
            returning() {
              if (normalized === "asmblyr_users") {
                const email = String(rows[0].email);
                if (state.users.some((user) => user.email === email)) {
                  const conflict = Object.assign(new Error("duplicate"), {
                    code: "23505",
                  });
                  return Promise.reject(conflict);
                }
                const created = {
                  id: `00000000-0000-4000-8000-0000000000${String(++nextUserSeq).padStart(2, "0")}`,
                  email,
                  status: "active" as const,
                  superuser: false,
                };
                state.users.push(created);
                return Promise.resolve([created]);
              }
              return Promise.resolve(rows);
            },
            then(
              resolve: (val: unknown) => void,
              reject?: (err: unknown) => void,
            ) {
              try {
                if (normalized === "asmblyr_user_invitations") {
                  for (const row of rows) {
                    state.invitations.push({
                      user_id: String(row.user_id),
                      token_hash: String(row.token_hash),
                      expires_at: row.expires_at as Date,
                    });
                  }
                } else if (normalized === "asmblyr_security_events") {
                  state.securityEvents.push(...rows);
                }
                resolve(rows);
              } catch (err) {
                reject?.(err);
              }
            },
          };
          return insertResult;
        },
      };
      return query;
    },
    { raw: () => Promise.resolve() },
  );

  return {
    transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(trx),
  } as unknown as Knex;
}

function baseState(): MockAccessState {
  return {
    users: [
      {
        id: ADMIN_ID,
        email: "admin@corp.local",
        status: "active",
        superuser: true,
      },
      {
        id: MANAGER_ID,
        email: "manager@corp.local",
        status: "active",
        superuser: false,
      },
      {
        id: TARGET_ID,
        email: "member@corp.local",
        status: "active",
        superuser: false,
      },
    ],
    policies: [
      { id: POLICY_A, name: "Sales" },
      { id: POLICY_B, name: "Support" },
      { id: POLICY_ADMIN_ONLY, name: "Finance Admin" },
    ],
    userPolicies: [
      { user_id: TARGET_ID, policy_id: POLICY_A },
      { user_id: TARGET_ID, policy_id: POLICY_ADMIN_ONLY },
    ],
    delegations: [
      { user_id: MANAGER_ID, policy_id: POLICY_A },
      { user_id: MANAGER_ID, policy_id: POLICY_B },
    ],
    invitations: [],
    settingsSectionsByUser: {
      [MANAGER_ID]: [
        { section: "users", action: "read" },
        { section: "users", action: "update" },
        { section: "policies", action: "update" },
      ],
    },
    securityEvents: [],
    forShareTables: [],
  };
}

test("replaceUserPolicies preserves out-of-scope policies for delegated managers using FOR SHARE", async () => {
  const state = baseState();
  const db = createAccessMockDb(state);

  // Delegated manager replaces in-scope POLICY_A with POLICY_B and omits POLICY_ADMIN_ONLY.
  const updated = await replaceUserPolicies(
    db,
    TARGET_ID,
    [POLICY_B],
    MANAGER_ID,
  );

  assert.deepEqual(updated.sort(), [POLICY_B, POLICY_ADMIN_ONLY].sort());
  assert.deepEqual(
    state.userPolicies
      .filter((row) => row.user_id === TARGET_ID)
      .map((row) => row.policy_id)
      .sort(),
    [POLICY_B, POLICY_ADMIN_ONLY].sort(),
  );
  assert.ok(state.forShareTables.includes("asmblyr_users"));
  assert.ok(state.forShareTables.includes("asmblyr_user_policy_delegations"));
  assert.ok(state.forShareTables.includes("asmblyr_policies"));
  assert.equal(state.securityEvents.at(-1)?.action, "user.policies_set");
});

test("replaceUserPolicies rejects adding out-of-scope policy, self-edit, superuser edit, and missing permissions", async () => {
  const state = baseState();
  state.userPolicies = [{ user_id: TARGET_ID, policy_id: POLICY_A }];
  const db = createAccessMockDb(state);

  // Attempting to add POLICY_ADMIN_ONLY (out of scope, not currently held) -> 403
  await assert.rejects(
    () =>
      replaceUserPolicies(
        db,
        TARGET_ID,
        [POLICY_A, POLICY_ADMIN_ONLY],
        MANAGER_ID,
      ),
    AccessDeniedError,
  );
  // Attempting to edit self -> 403
  await assert.rejects(
    () => replaceUserPolicies(db, MANAGER_ID, [POLICY_A], MANAGER_ID),
    AccessDeniedError,
  );
  // Attempting to edit superuser -> 403
  await assert.rejects(
    () => replaceUserPolicies(db, ADMIN_ID, [POLICY_A], MANAGER_ID),
    AccessDeniedError,
  );
  // Lacking policies:update -> 403
  state.settingsSectionsByUser[MANAGER_ID] = [
    { section: "users", action: "read" },
  ];
  await assert.rejects(
    () => replaceUserPolicies(db, TARGET_ID, [POLICY_B], MANAGER_ID),
    AccessDeniedError,
  );
});

test("replaceUserPolicies allows superuser full replacement and validates missing user/policy", async () => {
  const state = baseState();
  const db = createAccessMockDb(state);

  const updated = await replaceUserPolicies(
    db,
    TARGET_ID,
    [POLICY_B],
    ADMIN_ID,
  );
  assert.deepEqual(updated, [POLICY_B]);

  const cleared = await replaceUserPolicies(db, TARGET_ID, [], ADMIN_ID);
  assert.deepEqual(cleared, []);

  await assert.rejects(
    () => replaceUserPolicies(db, MISSING_ID, [POLICY_A], ADMIN_ID),
    UserNotFoundError,
  );
  await assert.rejects(
    () => replaceUserPolicies(db, TARGET_ID, [POLICY_MISSING], ADMIN_ID),
    PolicyNotFoundError,
  );
});

test("inviteUser and inviteUsersBulk enforce delegated starter policy and report Russian skip reasons", async () => {
  const state = baseState();
  const db = createAccessMockDb(state);

  // Delegated manager can invite with in-scope policy
  const single = await inviteUser(db, "new1@corp.local", {
    actorId: MANAGER_ID,
    policyId: POLICY_A,
  });
  assert.equal(single.policyId, POLICY_A);
  assert.ok(
    state.userPolicies.some(
      (row) => row.user_id === single.user.id && row.policy_id === POLICY_A,
    ),
  );

  // Delegated manager CANNOT invite with out-of-scope policy
  await assert.rejects(
    () =>
      inviteUser(db, "blocked@corp.local", {
        actorId: MANAGER_ID,
        policyId: POLICY_ADMIN_ONLY,
      }),
    AccessDeniedError,
  );

  // Bulk invite with out-of-scope policy fails upfront before creating any users
  const countBefore = state.users.length;
  await assert.rejects(
    () =>
      inviteUsersBulk(db, ["bulk1@corp.local", "bulk2@corp.local"], {
        actorId: MANAGER_ID,
        policyId: POLICY_ADMIN_ONLY,
      }),
    AccessDeniedError,
  );
  assert.equal(state.users.length, countBefore);

  // Bulk invite handles valid, duplicate-in-batch, already-exists, and invalid emails cleanly
  const bulk = await inviteUsersBulk(
    db,
    [
      "alice@corp.local",
      "ALICE@corp.local",
      "member@corp.local",
      "not-an-email",
      "bob@corp.local",
    ],
    { actorId: MANAGER_ID, policyId: POLICY_B },
  );
  assert.equal(bulk.created.length, 2);
  assert.deepEqual(
    bulk.created.map((item) => item.email),
    ["alice@corp.local", "bob@corp.local"],
  );
  assert.equal(bulk.skipped.length, 3);
  assert.equal(bulk.skipped[0]?.reason, "duplicate_in_batch");
  assert.match(bulk.skipped[0]?.message ?? "", /повторяется/i);
  assert.equal(bulk.skipped[1]?.reason, "already_exists");
  assert.match(bulk.skipped[1]?.message ?? "", /уже существует/i);
  assert.equal(bulk.skipped[2]?.reason, "invalid_email");
  assert.match(bulk.skipped[2]?.message ?? "", /Некорректный формат/i);

  // Duplicate single invite still throws AuthConflictError
  await assert.rejects(
    () => inviteUser(db, "alice@corp.local", { actorId: ADMIN_ID }),
    AuthConflictError,
  );
});

test("parseInviteInput, parseBulkInviteInput, and parseUsersListQuery validate inputs cleanly", () => {
  assert.deepEqual(parseInviteInput({ email: "User@Corp.RU" }), {
    email: "user@corp.ru",
    policyId: null,
  });
  assert.deepEqual(
    parseInviteInput({ email: "User@Corp.RU", policyId: POLICY_A }),
    { email: "user@corp.ru", policyId: POLICY_A },
  );
  assert.throws(
    () => parseInviteInput({ email: "user@corp.ru", policyId: "bad" }),
    AuthInputError,
  );

  assert.deepEqual(
    parseBulkInviteInput({
      emails: "a@corp.ru, b@corp.ru\nc@corp.ru; d@corp.ru",
      policyId: POLICY_B,
    }),
    {
      emails: ["a@corp.ru", "b@corp.ru", "c@corp.ru", "d@corp.ru"],
      policyId: POLICY_B,
    },
  );
  assert.throws(() => parseBulkInviteInput({ emails: "  " }), AuthInputError);

  // Backwards-compatible null when no directory params are passed
  assert.equal(parseUsersListQuery({}), null);
  assert.equal(parseUsersListQuery(undefined), null);

  assert.deepEqual(
    parseUsersListQuery({
      q: "Фёдоров",
      status: "active",
      policyId: POLICY_A,
      department: "Отдел продаж",
      page: "2",
      limit: "50",
    }),
    {
      q: "Фёдоров",
      status: "active",
      policyId: POLICY_A,
      department: "Отдел продаж",
      page: 2,
      limit: 50,
    },
  );
  assert.throws(() => parseUsersListQuery({ status: "bogus" }), AuthInputError);
  assert.throws(() => parseUsersListQuery({ limit: "999" }), AuthInputError);
  assert.throws(
    () => parseUsersListQuery({ policyId: "not-a-uuid" }),
    AuthInputError,
  );
});

function createStubPgKnex(
  handler: (sql: string, bindings: unknown[]) => Record<string, unknown>[],
): { db: Knex; captured: { sql: string; bindings: unknown[] }[] } {
  const captured: { sql: string; bindings: unknown[] }[] = [];
  const db = knex({ client: "pg" });
  const client = db.client as unknown as {
    acquireConnection: () => Promise<object>;
    releaseConnection: () => Promise<void>;
    _query: (
      connection: unknown,
      obj: { sql: string; bindings?: unknown[]; response?: unknown },
    ) => Promise<{ sql: string; bindings?: unknown[]; response: unknown }>;
  };
  client.acquireConnection = async () => ({});
  client.releaseConnection = async () => {};
  client._query = async (_connection, obj) => {
    const bindings = [...(obj.bindings ?? [])];
    captured.push({ sql: obj.sql, bindings });
    const rows = handler(obj.sql, bindings);
    obj.response = { rows, rowCount: rows.length, command: "SELECT" };
    return obj as { sql: string; bindings?: unknown[]; response: unknown };
  };
  return { db, captured };
}

test("condition preview validates input and compiles row filter against collection schema", async () => {
  assert.throws(
    () =>
      parseConditionPreviewInput({
        collection: "asmblyr_users",
        condition: null,
      }),
    PolicyInputError,
  );
  assert.throws(
    () =>
      parseConditionPreviewInput({
        collection: "deals",
        condition: { bad: true },
      }),
    /Invalid permission condition/,
  );

  const { db, captured } = createStubPgKnex((sql) => {
    if (sql.includes("FROM public.asmblyr_columns")) {
      return [
        {
          column_name: "owner_id",
          data_type: "uuid",
          character_maximum_length: null,
          is_nullable: "YES",
          semantic_type: null,
          required: false,
          default_value: null,
          searchable: false,
          search_priority: null,
          presentation: null,
          relation_target: "@users",
          relation_key_type: "uuid",
        },
        {
          column_name: "status",
          data_type: "text",
          character_maximum_length: null,
          is_nullable: "YES",
          semantic_type: null,
          required: false,
          default_value: null,
          searchable: true,
          search_priority: null,
          presentation: null,
          relation_target: null,
          relation_key_type: null,
        },
      ];
    }
    if (sql.includes("asmblyr_collections")) {
      return [
        {
          id: "col-deals",
          name: "deals",
          primary_key_name: "id",
          primary_key_type: "uuid",
          created_at_enabled: false,
          updated_at_enabled: false,
          source_kind: "table",
          mode: "multiple",
          state: null,
        },
      ];
    }
    if (sql.includes('"public"."deals"')) {
      const isFiltered = sql.toLowerCase().includes(" where ");
      return [{ count: isFiltered ? "7" : "42" }];
    }
    return [];
  });

  const result = await previewPolicyCondition(
    db,
    {
      kind: "user",
      id: ADMIN_ID,
      email: "admin@corp.local",
      superuser: true,
    },
    {
      collection: "deals",
      condition: {
        logic: "and",
        children: [
          {
            field: "owner_id",
            op: "eq",
            value: { kind: "context", path: "user.id" },
          },
          {
            field: "status",
            op: "eq",
            value: { kind: "literal", value: "open" },
          },
        ],
      },
    },
  );

  assert.deepEqual(result, { matchingCount: 7, totalCount: 42 });
  const filteredQuery = captured.find(
    (entry) =>
      entry.sql.includes('"public"."deals"') &&
      entry.sql.toLowerCase().includes(" where "),
  );
  assert.ok(filteredQuery, "Expected filtered count query on public.deals");
  assert.ok(filteredQuery.bindings.includes(ADMIN_ID));
  assert.ok(filteredQuery.bindings.includes("open"));
});

test("listUsersDirectory applies ё→е search across base and custom profile fields, filters, and pagination", async () => {
  assert.deepEqual(
    sortDepartmentLabels(["Юристы", "Бухгалтерия", "Ёлка", "Бухгалтерия", ""]),
    ["Бухгалтерия", "Ёлка", "Юристы"],
  );

  const DEPT_SALES_ID = "20000000-0000-4000-8000-000000000001";
  const DEPT_DEV_ID = "20000000-0000-4000-8000-000000000002";

  const { db, captured } = createStubPgKnex((sql) => {
    if (sql.includes("asmblyr_system_fields")) {
      return [
        {
          collection_name: "users",
          field_name: "job_title",
          definition: { name: "job_title", type: "text" },
          presentation: {},
        },
        {
          collection_name: "users",
          field_name: "telegram",
          definition: { name: "telegram", type: "text" },
          presentation: {},
        },
        {
          collection_name: "users",
          field_name: "department_id",
          definition: {
            name: "department_id",
            type: "uuid",
            relation: { kind: "m2o", collection: "departments" },
          },
          presentation: {},
        },
        {
          collection_name: "users",
          field_name: "secret_pin",
          definition: { name: "secret_pin", type: "text" },
          presentation: { sensitive: true },
        },
      ];
    }
    if (sql.includes("asmblyr_profile_extension")) {
      return [];
    }
    if (sql.includes("FROM public.asmblyr_collections AS m")) {
      return [
        {
          source_kind: "table",
          name: "departments",
          display_name: "Отделы",
          translations: {},
          hidden: false,
          mcp_enabled: true,
          mcp_description: null,
          folder_id: null,
          parent_collection: null,
          created_at: new Date("2026-01-01T00:00:00Z"),
          mode: "multiple",
          display_field: "name",
          display_template: null,
          form_layout: null,
          primary_key_name: "id",
          primary_key_type: "uuid",
          created_at_enabled: false,
          updated_at_enabled: false,
          state: null,
          profile_extension: false,
          column_name: "name",
          data_type: "text",
          is_nullable: "NO",
          semantic_type: null,
          required: true,
          default_value: null,
          searchable: true,
          search_priority: null,
          search_indexed: false,
          relation_target: null,
          relation_key_name: null,
          relation_key_type: null,
          on_delete: null,
          relation_searchable: null,
          presentation: null,
        },
      ];
    }
    if (sql.includes('"public"."departments"')) {
      return [
        { id: DEPT_SALES_ID, name: "Отдел продаж" },
        { id: DEPT_DEV_ID, name: "Разработка" },
      ];
    }
    if (sql.includes('"public"."asmblyr_users"') && sql.includes("distinct")) {
      return [{ department_id: DEPT_DEV_ID }, { department_id: DEPT_SALES_ID }];
    }
    if (sql.includes('"asmblyr_users" as "usr"') && sql.includes("FILTER")) {
      return [{ all: 120, disabled: 5, invited: 10 }];
    }
    if (
      sql.includes('"asmblyr_users" as "usr"') &&
      sql.includes('count(*) as "total"')
    ) {
      return [{ total: "3" }];
    }
    if (sql.includes('"asmblyr_users" as "usr"')) {
      return [
        {
          id: TARGET_ID,
          email: "fedorov@corp.local",
          status: "active",
          superuser: false,
          created_at: new Date("2026-01-01T00:00:00Z"),
          firstName: "Пётр",
          lastName: "Фёдоров",
          displayName: "Фёдоров Пётр",
          description: null,
          avatarId: null,
          pictureUrl: null,
          lastLoginAt: null,
          lastActiveAt: null,
          hasPassword: true,
          invitationPending: false,
          hasDelegation: false,
          _departmentRaw: DEPT_SALES_ID,
        },
      ];
    }
    if (sql.includes('"public"."asmblyr_user_policies"')) {
      return [{ user_id: TARGET_ID, policy_id: POLICY_A }];
    }
    return [];
  });

  const page = await listUsersDirectory(db, {
    q: "ФЁДОРОВ",
    status: "active",
    policyId: POLICY_A,
    department: "Отдел продаж",
    page: 2,
    limit: 10,
  });

  assert.equal(page.meta.total, 3);
  assert.equal(page.meta.page, 2);
  assert.equal(page.meta.limit, 10);
  assert.deepEqual(page.meta.statusCounts, {
    all: 120,
    active: 105,
    disabled: 5,
    invited: 10,
  });
  assert.deepEqual(page.meta.departments, ["Отдел продаж", "Разработка"]);
  assert.equal(page.data.length, 1);
  assert.equal(page.data[0]?.department, "Отдел продаж");
  assert.deepEqual(page.data[0]?.policyIds, [POLICY_A]);

  const dataQuery = captured.find(
    (entry) =>
      entry.sql.includes('"asmblyr_users" as "usr"') &&
      entry.sql.includes("offset"),
  );
  assert.ok(dataQuery, "Expected paginated query on asmblyr_users");
  // ё→е normalized binding
  assert.ok(dataQuery.bindings.includes("%федоров%"));
  // Custom non-sensitive columns searched, sensitive column excluded
  assert.ok(dataQuery.sql.includes('"job_title"'));
  assert.ok(dataQuery.sql.includes('"telegram"'));
  assert.ok(!dataQuery.sql.includes("secret_pin"));
  // Pagination bindings: limit=10, offset=10
  assert.ok(
    dataQuery.sql.includes("limit") && dataQuery.sql.includes("offset"),
  );
  // Department filter applied via resolved department_id
  assert.ok(dataQuery.bindings.includes(DEPT_SALES_ID));
  // Policy filter applied
  assert.ok(dataQuery.bindings.includes(POLICY_A));
});
