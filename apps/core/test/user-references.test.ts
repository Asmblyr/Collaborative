import assert from "node:assert/strict";
import test from "node:test";
import type { Knex } from "knex";
import {
  listUserReferences,
  normalizeSearchText,
  requireUserReferenceRead,
} from "../src/auth/user-references.js";
import { AccessDeniedError } from "../src/permissions/access.js";

test("requireUserReferenceRead allows any authenticated user and rejects service accounts", async () => {
  const unusedDb = {} as Knex;
  await assert.doesNotReject(() =>
    requireUserReferenceRead(unusedDb, {
      kind: "user",
      id: "00000000-0000-0000-0000-000000000001",
      email: "viewer@corp.local",
      superuser: false,
      sessionId: "00000000-0000-0000-0000-000000000010",
    }),
  );
  await assert.doesNotReject(() =>
    requireUserReferenceRead(unusedDb, {
      kind: "user",
      id: "00000000-0000-0000-0000-000000000002",
      email: "admin@corp.local",
      superuser: true,
      sessionId: "00000000-0000-0000-0000-000000000020",
    }),
  );
  await assert.rejects(
    () =>
      requireUserReferenceRead(unusedDb, {
        kind: "service",
        id: "00000000-0000-0000-0000-000000000003",
        keyId: null,
        federationId: null,
        superuser: false,
      }),
    AccessDeniedError,
  );
});

test("normalizeSearchText normalizes whitespace, case, and ё to е", () => {
  assert.equal(normalizeSearchText("  Фёдорова  "), "федорова");
  assert.equal(normalizeSearchText("ЁЛКИН"), "елкин");
  assert.equal(normalizeSearchText("федорова"), "федорова");
});

test("listUserReferences normalizes ё/е in SQL search and projects only id and label", async () => {
  const rawWhereCalls: { sql: string; bindings: unknown[] }[] = [];
  const selectedColumns: unknown[] = [];

  function createBuilder() {
    const builder = {
      whereIn() {
        return builder;
      },
      where(arg: string | ((nested: typeof builder) => void)) {
        if (typeof arg === "function") {
          arg(builder);
        }
        return builder;
      },
      orWhereRaw(sql: string, bindings: unknown[]) {
        rawWhereCalls.push({ sql, bindings });
        return builder;
      },
      clone() {
        return builder;
      },
      select(...cols: unknown[]) {
        selectedColumns.push(...cols);
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit() {
        return builder;
      },
      offset() {
        return Promise.resolve([
          {
            id: "11111111-1111-1111-1111-111111111111",
            label: "Фёдорова Анна · fedorova@corp.local",
            password_hash: "never-exposed",
          },
        ]);
      },
      count() {
        return {
          first: () => Promise.resolve({ total: "1" }),
        };
      },
    };
    return builder;
  }

  const db = Object.assign(() => createBuilder(), {
    raw: (sql: string) => sql,
  }) as unknown as Knex;

  const result = await listUserReferences(
    db,
    {
      kind: "user",
      id: "00000000-0000-0000-0000-000000000001",
      email: "editor@corp.local",
      superuser: false,
      sessionId: "00000000-0000-0000-0000-000000000010",
    },
    { q: "Фёдорова" },
  );

  assert.equal(result.data.length, 1);
  assert.deepEqual(Object.keys(result.data[0]).sort(), ["id", "label"]);
  assert.equal(
    result.labels["11111111-1111-1111-1111-111111111111"],
    "Фёдорова Анна · fedorova@corp.local",
  );
  assert.ok(rawWhereCalls.length >= 4);
  for (const call of rawWhereCalls) {
    assert.match(call.sql, /replace\(lower\(/);
    assert.ok(call.bindings.includes("%федорова%"));
  }
  assert.equal(selectedColumns[0], "id");
});
