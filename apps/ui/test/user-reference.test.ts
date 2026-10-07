import test from "node:test";
import assert from "node:assert/strict";
import {
  userReferenceUrl,
  userReferenceCollection,
} from "../src/components/items/user-reference";
import { tableRelationRequests } from "../src/components/items/table-relation-requests";
import { filterScopes } from "../src/components/items/item-filter-options";
import { relationSelectionCondition } from "../src/components/items/item-filter-relation";

test("system user selection routes IDs to the bounded directory, never ordinary items", () => {
  const params = new URLSearchParams({
    limit: "20",
    filter: JSON.stringify({
      logic: "and",
      children: [{ field: "id", op: "in", value: ["a", "b"] }],
    }),
  });
  assert.equal(
    userReferenceUrl(params),
    "/api/users/references?limit=20&ids=a%2Cb",
  );
  assert.throws(() =>
    userReferenceUrl(
      new URLSearchParams({
        filter: JSON.stringify({
          logic: "or",
          children: [{ field: "email", op: "contains", value: "@" }],
        }),
      }),
    ),
  );
  const column = {
    name: "manager",
    label: "Manager",
    type: "relation",
    relation: {
      kind: "m2o" as const,
      collection: "@users",
      primaryKey: { name: "id", type: "uuid" as const },
      onDelete: "setNull" as const,
    },
  };
  assert.deepEqual(
    tableRelationRequests([], [{ manager: "a" }, { manager: "a" }], [column]),
    [{ collection: "@users", key: "id", label: "label", ids: ["a"] }],
  );
  const source = {
    ...userReferenceCollection("Departments"),
    name: "departments",
    fields: [{ ...column, required: false, nullable: true }],
    access: { ...userReferenceCollection("").access, read: ["*"] },
  };
  const scope = filterScopes(source, []).find((s) => s.id === "manager");
  assert.equal(scope?.collection, "@users");
  assert.equal(scope?.presenceField, undefined);
  assert.deepEqual(scope?.fields, []);
  assert.deepEqual(relationSelectionCondition(scope!), {
    field: "manager",
    op: "eq",
    value: "",
  });
});
