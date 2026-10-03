import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionFilter } from "@asmblyr/contracts";
import { policyDraft } from "../src/components/access/policy-draft";
import {
  conditionIsValid,
  compatibleParameters,
  permissionFields,
} from "../src/components/access/policy-condition-model";
import type {
  Permission,
  PolicyCollection,
} from "../src/components/access/types";

const own: PermissionFilter = {
  logic: "and",
  children: [
    { field: "owner", op: "eq", value: { kind: "context", path: "user.id" } },
  ],
};
const collection: PolicyCollection = {
  name: "articles",
  displayName: "Статьи",
  primaryKey: { name: "id", type: "uuid" },
  timestamps: { createdAt: true, updatedAt: false },
  fields: [
    {
      name: "owner",
      type: "uuid",
      presentation: {
        label: "Автор",
        description: "",
        placeholder: "",
        interface: "auto",
        width: "full",
        order: 0,
        group: "",
      },
    },
    { name: "price", type: "decimal" },
    { name: "enabled", type: "boolean" },
  ],
};

test("editing a policy preserves conditional field branches instead of broadening them", () => {
  const permissions: Permission[] = [
    {
      id: "first",
      policyIds: ["policy"],
      collection: "articles",
      action: "read",
      fields: ["title"],
    },
    {
      id: "second",
      policyIds: ["policy"],
      collection: "articles",
      action: "read",
      fields: ["body"],
      rowFilter: own,
    },
  ];
  const draft = policyDraft("policy", permissions);
  assert.equal(draft.length, 2);
  assert.deepEqual(draft[0].fields, ["title"]);
  assert.deepEqual(draft[1], {
    collection: "articles",
    action: "read",
    fields: ["body"],
    rowFilter: own,
  });
});

test("permission hints and validation stay specific to the schema and operand type", () => {
  const fields = permissionFields(collection);
  assert.equal(fields.find((field) => field.name === "owner")?.label, "Автор");
  assert.deepEqual(
    compatibleParameters(fields.find((field) => field.name === "price")!, "eq"),
    [],
  );
  assert.equal(conditionIsValid(own, fields), true);
  assert.equal(conditionIsValid({ logic: "and", children: [] }, fields), false);
  assert.equal(
    conditionIsValid(
      {
        logic: "and",
        children: [
          {
            field: "price",
            op: "eq",
            value: { kind: "context", path: "user.id" },
          },
        ],
      },
      fields,
    ),
    false,
  );
  assert.equal(
    conditionIsValid(
      {
        logic: "and",
        children: [
          {
            field: "enabled",
            op: "eq",
            value: { kind: "literal", value: "not-a-boolean" },
          },
        ],
      },
      fields,
    ),
    false,
  );
  assert.equal(
    conditionIsValid(
      {
        logic: "and",
        children: Array.from({ length: 21 }, () => own.children[0]),
      },
      fields,
    ),
    false,
  );
});
