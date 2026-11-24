import assert from "node:assert/strict";
import test from "node:test";
import {
  compareUsersByName,
  delegatingPolicyIdsFromPermissions,
  excludedPermissionFields,
  localizeAccessError,
  matchesAccessSearch,
  normalizeAccessSearch,
  parseInviteEmailList,
  resolveCollectionFieldLabel,
  userStatusCategory,
} from "../src/components/access/access-helpers";
import {
  isSimpleUnconditionalGrant,
  toggleUnconditionalGrant,
  type DraftGrant,
} from "../src/components/access/policy-draft";
import type {
  Permission,
  PolicyCollection,
} from "../src/components/access/types";
import { parseUserReferenceDisplay } from "../src/components/items/record-chooser-content";

test("ё/е search normalization matches Russian names in both directions", () => {
  assert.equal(normalizeAccessSearch("Фёдорова"), "федорова");
  assert.equal(matchesAccessSearch(["Фёдорова Анна"], "федорова"), true);
  assert.equal(matchesAccessSearch(["Федорова Анна"], "ФЁДОРОВА"), true);
  assert.equal(matchesAccessSearch(["Иванов Пётр"], "петр"), true);
  assert.equal(matchesAccessSearch(["Иванов Пётр"], "сидоров"), false);
});

test("compareUsersByName sorts by display name with email fallback", () => {
  const users = [
    {
      displayName: null,
      firstName: null,
      lastName: null,
      email: "zebra@corp.local",
    },
    {
      displayName: "Фёдорова Анна",
      firstName: "Анна",
      lastName: "Фёдорова",
      email: "zzz@corp.local",
    },
    {
      displayName: "Алексеев Иван",
      firstName: "Иван",
      lastName: "Алексеев",
      email: "mmm@corp.local",
    },
  ];
  const sorted = [...users].sort(compareUsersByName);
  assert.deepEqual(
    sorted.map((user) => user.email),
    ["mmm@corp.local", "zzz@corp.local", "zebra@corp.local"],
  );
});

test("userStatusCategory distinguishes active, invited, and disabled users", () => {
  assert.equal(
    userStatusCategory({
      status: "disabled",
      superuser: false,
      hasPassword: true,
      invitationPending: false,
    }),
    "disabled",
  );
  assert.equal(
    userStatusCategory({
      status: "active",
      superuser: false,
      hasPassword: false,
      invitationPending: true,
    }),
    "invited",
  );
  assert.equal(
    userStatusCategory({
      status: "active",
      superuser: false,
      hasPassword: true,
      invitationPending: false,
    }),
    "active",
  );
});

test("localizeAccessError translates known duplicate and status errors to Russian", () => {
  assert.match(localizeAccessError("Email already exists"), /уже существует/i);
  assert.match(
    localizeAccessError("Policy name already exists"),
    /уже существует/i,
  );
  assert.match(
    localizeAccessError("Cannot disable the last active superuser"),
    /суперпользователя/i,
  );
  assert.equal(localizeAccessError("Уже по-русски"), "Уже по-русски");
});

test("collection labels and excluded fields highlight hidden fields cleanly", () => {
  const collection: PolicyCollection = {
    name: "archive_docs",
    displayName: "Архивные документы",
    primaryKey: { name: "id", type: "uuid" },
    timestamps: { createdAt: true, updatedAt: true },
    fields: [
      {
        name: "title",
        type: "text",
        presentation: {
          label: "Название",
          description: "",
          placeholder: "",
          interface: "auto",
          width: "full",
          order: 0,
          group: "",
        },
      },
      {
        name: "amount_rub",
        type: "decimal",
        presentation: {
          label: "Сумма (₽)",
          description: "",
          placeholder: "",
          interface: "auto",
          width: "full",
          order: 1,
          group: "",
        },
      },
    ],
  };

  assert.equal(resolveCollectionFieldLabel("title", collection), "Название");
  assert.equal(
    resolveCollectionFieldLabel("amount_rub", collection),
    "Сумма (₽)",
  );
  assert.deepEqual(
    excludedPermissionFields(
      { action: "read", fields: ["id", "title"] },
      collection,
    ),
    [{ name: "amount_rub", label: "Сумма (₽)" }],
  );
  assert.deepEqual(
    excludedPermissionFields({ action: "read", fields: ["*"] }, collection),
    [],
  );
});

test("delegatingPolicyIdsFromPermissions detects policies with users/policies update permissions", () => {
  const permissions: Permission[] = [
    {
      id: "p1",
      policyIds: ["pol-reader"],
      section: "policies",
      action: "read",
      fields: ["*"],
    },
    {
      id: "p2",
      policyIds: ["pol-manager"],
      section: "policies",
      action: "update",
      fields: ["*"],
    },
    {
      id: "p3",
      policyIds: ["pol-user-admin"],
      section: "users",
      action: "update",
      fields: ["*"],
    },
  ];
  assert.deepEqual(delegatingPolicyIdsFromPermissions(permissions).sort(), [
    "pol-manager",
    "pol-user-admin",
  ]);
});

test("parseUserReferenceDisplay hides noisy UUID detail for @users items", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  assert.deepEqual(
    parseUserReferenceDisplay(
      userId,
      { id: userId, label: "Фёдорова Анна · fedorova@corp.local" },
      "Фёдорова Анна · fedorova@corp.local",
      `ID: ${userId}`,
    ),
    { primary: "Фёдорова Анна", secondary: "fedorova@corp.local" },
  );
  assert.deepEqual(
    parseUserReferenceDisplay(
      userId,
      { id: userId, label: "admin@corp.local" },
      "admin@corp.local",
      `ID: ${userId}`,
    ),
    { primary: "admin@corp.local" },
  );
  assert.equal(
    parseUserReferenceDisplay(
      userId,
      { id: userId, title: "Задача 1", status: "open" },
      "Задача 1",
      `ID: ${userId}`,
    ),
    null,
  );
});

test("parseInviteEmailList splits comma, semicolon, and newline-separated addresses", () => {
  assert.deepEqual(
    parseInviteEmailList("a@corp.ru, b@corp.ru;\nc@corp.ru\r\n  d@corp.ru  "),
    ["a@corp.ru", "b@corp.ru", "c@corp.ru", "d@corp.ru"],
  );
  assert.deepEqual(parseInviteEmailList("   "), []);
  assert.match(
    localizeAccessError("At least one email is required"),
    /хотя бы одну/i,
  );
  assert.match(
    localizeAccessError("Too many emails in a single batch"),
    /максимум 200/i,
  );
});

test("toggleUnconditionalGrant quick-toggles simple grants and protects conditional/scoped rules", () => {
  const initial: DraftGrant[] = [];
  const enabled = toggleUnconditionalGrant(initial, "deals", "read");
  assert.equal(enabled.kind, "toggled");
  assert.deepEqual(enabled.grants, [
    { collection: "deals", action: "read", fields: ["*"], rowFilter: null },
  ]);
  assert.equal(isSimpleUnconditionalGrant(enabled.grants[0]!), true);

  const disabled = toggleUnconditionalGrant(enabled.grants, "deals", "read");
  assert.equal(disabled.kind, "toggled");
  assert.deepEqual(disabled.grants, []);

  const conditional: DraftGrant[] = [
    {
      collection: "deals",
      action: "read",
      fields: ["*"],
      rowFilter: {
        logic: "and",
        children: [
          {
            field: "owner_id",
            op: "eq",
            value: { kind: "context", path: "user.id" },
          },
        ],
      },
    },
  ];
  assert.equal(
    toggleUnconditionalGrant(conditional, "deals", "read").kind,
    "open_dialog",
  );

  const fieldScoped: DraftGrant[] = [
    {
      collection: "deals",
      action: "update",
      fields: ["title"],
      rowFilter: null,
    },
  ];
  assert.equal(
    toggleUnconditionalGrant(fieldScoped, "deals", "update").kind,
    "open_dialog",
  );
});
