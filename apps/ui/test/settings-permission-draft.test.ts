import assert from "node:assert/strict";
import test from "node:test";
import { policySettingsDraft } from "../src/components/access/policy-settings-draft";
import type { Permission } from "../src/components/access/types";

test("policy drafts preserve read-only grants and collapse duplicate levels without upgrading", () => {
  const grants: Permission[] = [
    {
      id: "read",
      section: "plugins",
      action: "read",
      fields: ["*"],
      policyIds: ["p"],
    },
    {
      id: "other",
      section: "plugins",
      action: "update",
      fields: ["*"],
      policyIds: ["other"],
    },
    {
      id: "data",
      collection: "articles",
      action: "read",
      fields: ["title"],
      policyIds: ["p"],
    },
  ];
  assert.deepEqual(policySettingsDraft("p", grants), [
    { section: "plugins", action: "read", fields: ["*"] },
  ]);
  const writer: Permission = {
    id: "write",
    section: "plugins",
    action: "update",
    fields: ["*"],
    policyIds: ["p"],
  };
  const expected = [{ section: "plugins", action: "update", fields: ["*"] }];
  assert.deepEqual(policySettingsDraft("p", [...grants, writer]), expected);
  assert.deepEqual(policySettingsDraft("p", [writer, ...grants]), expected);
  assert.deepEqual(policySettingsDraft(undefined, grants), []);
});
