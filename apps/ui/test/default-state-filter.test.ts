import assert from "node:assert/strict";
import test from "node:test";
import { defaultCollectionState } from "@asmblyr/contracts";
import { defaultStateFilter } from "../src/components/items/default-state-filter";
import { filterFields } from "../src/components/items/item-filter-options";
import { describeFilter } from "../src/components/items/item-filter-description";
import type { Collection } from "../src/components/items/types";
import { itemsPageHref } from "../src/lib/item-location";

const collection: Collection = {
  name: "posts",
  folderId: null,
  mode: "multiple",
  primaryKey: { name: "id", type: "uuid" },
  timestamps: { createdAt: false, updatedAt: false },
  state: defaultCollectionState(),
  fields: [{ name: "status", type: "text", nullable: false, required: true }],
  access: { create: ["*"], read: ["*"], update: ["*"], delete: true, structure: true },
};

test("pagination keeps explicit state filter resets and preserves search", () => {
  const page = { number: BigInt(2), size: 25, sort: "id", direction: "asc" as const };
  const cleared = new URL(itemsPageHref("/items/posts", page, "example", ""), "http://localhost");
  assert.equal(cleared.searchParams.get("filter"), "");
  assert.equal(cleared.searchParams.get("q"), "example");
  assert.equal(cleared.searchParams.get("page"), "2");
  const filter = defaultStateFilter(collection);
  const visible = new URL(itemsPageHref("/items/posts", page, "", filter), "http://localhost");
  assert.equal(visible.searchParams.get("filter"), filter);
});

test("default table filter excludes hidden states and preserves imported unknown state", () => {
  const condition = { field: "status", op: "notIn", value: ["draft", "archived"] };
  assert.deepEqual(JSON.parse(defaultStateFilter(collection)), {
    logic: "and",
    children: [condition],
  });
  const imported = { ...collection, fields: [{ ...collection.fields[0], nullable: true }] };
  assert.deepEqual(JSON.parse(defaultStateFilter(imported)), {
    logic: "or",
    children: [condition, { field: "status", op: "isNull" }],
  });
  const customized = {
    ...collection,
    state: {
      ...defaultCollectionState(),
      statuses: [{ value: "review", label: "Review", color: "blue" as const, hidden: true }],
    },
  };
  assert.deepEqual(JSON.parse(defaultStateFilter(customized)).children[0].value, ["review"]);
});

test("table defaults cannot query unreadable state and do not affect singleton forms", () => {
  assert.equal(
    defaultStateFilter({ ...collection, access: { ...collection.access, read: ["title"] } }),
    "",
  );
  assert.equal(defaultStateFilter({ ...collection, state: null }), "");
  assert.equal(defaultStateFilter({ ...collection, mode: "single" }), "");
  assert.equal(
    defaultStateFilter({
      ...collection,
      state: {
        ...defaultCollectionState(),
        statuses: defaultCollectionState().statuses.map((status) => ({ ...status, hidden: false })),
      },
    }),
    "",
  );
});

test("filter values and summaries use display labels without changing stored codes", () => {
  const options = defaultCollectionState().statuses.map(({ value, label }) => ({ value, label }));
  const presented: Collection = {
    ...collection,
    fields: [
      {
        ...collection.fields[0],
        presentation: {
          label: "Состояние",
          interface: "select",
          options,
          description: "",
          placeholder: "",
          width: "full",
          order: 0,
          group: "",
        },
      },
    ],
  };
  assert.deepEqual(
    filterFields(presented, []).find((field) => field.name === "status")?.options,
    options,
  );
  const label = describeFilter(
    { field: "status", op: "in", value: ["draft", "archived"] },
    new Map([["status", "Состояние"]]),
    new Map([["status", options]]),
  );
  assert.ok(label.includes("Черновик, Архивировано"));
  assert.ok(!label.includes("draft"));
});
