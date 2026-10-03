import assert from "node:assert/strict";
import test from "node:test";
import {
  defineCollection,
  useStorage,
  type AsmblyrContext,
} from "@asmblyr/kit";

const entries = defineCollection({
  name: "entries",
  primaryKey: { name: "id", type: "bigserial" },
  timestamps: { createdAt: true, updatedAt: false },
  fields: {
    body: { type: "text", required: true, nullable: false },
    amount: { type: "decimal", required: false, nullable: true },
    published: { type: "datetime", required: false, nullable: true },
    files: { type: "files", required: false, nullable: true },
    extra: { type: "json", required: false, nullable: true },
  },
});

test("typed storage keeps precision, normalizes dates and delegates only to owned storage", async () => {
  const row = {
    id: "9007199254740993",
    body: "comment",
    amount: "1.2345678901",
    created_at: new Date("2026-10-02T06:00:00.123Z"),
    published: null,
    files: ["file-id"],
    extra: { answer: 42 },
  };
  const calls: unknown[][] = [];
  const context = {
    storage: {
      async get(...args: unknown[]) {
        calls.push(args);
        return { data: row, label: row.id };
      },
      async create(...args: unknown[]) {
        calls.push(args);
        return { data: row };
      },
      async update(...args: unknown[]) {
        calls.push(args);
        return { data: row };
      },
      async delete(...args: unknown[]) {
        calls.push(args);
      },
      async list() {
        return {
          data: [row],
          labels: {},
          page: {
            number: 1,
            size: 30,
            total: "1",
            sort: "id",
            direction: "asc" as const,
          },
        };
      },
    },
  } as AsmblyrContext;
  const storage = useStorage(context, entries);
  const result = await storage.get(row.id);
  assert.equal(result.id, row.id);
  assert.equal(result.amount, row.amount);
  assert.equal(result.created_at, "2026-10-02T06:00:00.123Z");
  assert.equal(result.published, null);
  assert.deepEqual(result.extra, { answer: 42 });
  assert.ok(
    row.created_at instanceof Date,
    "normalization does not mutate Core's row",
  );
  assert.deepEqual((await storage.list()).data, [result]);
  assert.deepEqual(await storage.create({ body: "comment" }), result);
  assert.deepEqual(await storage.update(row.id, { body: "edited" }), result);
  await storage.delete(row.id);
  assert.deepEqual(calls, [
    ["entries", row.id],
    ["entries", { body: "comment" }],
    ["entries", row.id, { body: "edited" }],
    ["entries", row.id],
  ]);
  // @ts-expect-error Simulate untyped JavaScript attempting a partial projection.
  await assert.rejects(storage.list({ fields: ["body"] }), /full rows/);
  assert.throws(() => useStorage({} as AsmblyrContext, entries), /unavailable/);
});

test("typed storage rejects mismatched declarations instead of silently coercing values", async () => {
  const context = {
    storage: { get: async () => ({ data: { id: "1", body: 12 } }) },
  } as unknown as AsmblyrContext;
  await assert.rejects(useStorage(context, entries).get("1"), /entries.body/);
  const forbidden = new Error("owned collection required");
  const scoped = {
    storage: {
      get: async () => {
        throw forbidden;
      },
    },
  } as unknown as AsmblyrContext;
  await assert.rejects(
    useStorage(scoped, entries).get("1"),
    (error) => error === forbidden,
  );
});
