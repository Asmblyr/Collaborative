import assert from "node:assert/strict";
import test from "node:test";
import type { Knex } from "knex";
import { setUserStatus } from "../src/auth/user-status.js";
import {
  AuthConflictError,
  AuthInputError,
  parseUserStatus,
  UserNotFoundError,
} from "../src/auth/validation.js";
import { AccessDeniedError } from "../src/permissions/access.js";

interface MockUser {
  id: string;
  email: string;
  status: "active" | "disabled";
  superuser: boolean;
}

interface MockState {
  users: MockUser[];
  sessions: { id: string; user_id: string; revoked_at: Date | null }[];
  invitations: { user_id: string; consumed_at: Date | null }[];
  securityEvents: Record<string, unknown>[];
  userPolicies?: { user_id: string; policy_id: string }[];
  delegations?: { user_id: string; policy_id: string }[];
  settingsSections?: { section: string; action: string }[];
}

function createMockDb(state: MockState): Knex {
  const trx = Object.assign(
    (table: string) => {
      const normalized = table.replace(/^public\./, "").split(" as ")[0];
      let filters: Record<string, unknown> = {};
      let nullFilter: string | null = null;
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
        whereNull(col: string) {
          nullFilter = col;
          return query;
        },
        whereNotNull() {
          return query;
        },
        whereIn() {
          return query;
        },
        forUpdate() {
          return query;
        },
        forShare() {
          return query;
        },
        orderBy() {
          return query;
        },
        distinct() {
          if (normalized === "asmblyr_user_policies") {
            return Promise.resolve(state.settingsSections ?? []);
          }
          return Promise.resolve([]);
        },
        pluck(column: string) {
          if (normalized === "asmblyr_user_policies") {
            return Promise.resolve(
              (state.userPolicies ?? [])
                .filter((row) => row.user_id === filters.user_id)
                .map((row) => row[column as keyof typeof row]),
            );
          }
          if (normalized === "asmblyr_user_policy_delegations") {
            return Promise.resolve(
              (state.delegations ?? [])
                .filter((row) => row.user_id === filters.user_id)
                .map((row) => row[column as keyof typeof row]),
            );
          }
          return Promise.resolve([]);
        },
        first() {
          if (normalized === "asmblyr_users") {
            const match = state.users.find((user) =>
              Object.entries(filters).every(
                ([key, val]) => user[key as keyof MockUser] === val,
              ),
            );
            return Promise.resolve(match);
          }
          if (normalized === "asmblyr_user_invitations") {
            const match = state.invitations.find(
              (inv) =>
                inv.user_id === filters.user_id &&
                (nullFilter !== "consumed_at" || inv.consumed_at === null),
            );
            return Promise.resolve(match);
          }
          return Promise.resolve(undefined);
        },
        select() {
          if (normalized === "asmblyr_users") {
            const matches = state.users.filter((user) =>
              Object.entries(filters).every(
                ([key, val]) => user[key as keyof MockUser] === val,
              ),
            );
            return Promise.resolve(matches);
          }
          return Promise.resolve([]);
        },
        update(patch: Record<string, unknown>) {
          return {
            returning() {
              if (normalized === "asmblyr_users") {
                const user = state.users.find(
                  (entry) => entry.id === filters.id,
                );
                if (!user) {
                  return Promise.resolve([]);
                }
                user.status = patch.status as "active" | "disabled";
                return Promise.resolve([{ ...user }]);
              }
              if (normalized === "asmblyr_auth_sessions") {
                const revoked = state.sessions.filter(
                  (session) =>
                    session.user_id === filters.user_id &&
                    session.revoked_at === null,
                );
                for (const session of revoked) {
                  session.revoked_at = new Date();
                }
                return Promise.resolve(revoked.map((row) => ({ id: row.id })));
              }
              return Promise.resolve([]);
            },
          };
        },
        insert(row: Record<string, unknown>) {
          if (normalized === "asmblyr_security_events") {
            state.securityEvents.push(row);
          }
          return Promise.resolve([row]);
        },
      };
      return query;
    },
    {
      raw: () => Promise.resolve(),
      fn: { now: () => new Date() },
    },
  );

  return {
    transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(trx),
  } as unknown as Knex;
}

test("parseUserStatus accepts active/disabled and rejects invalid payloads", () => {
  assert.equal(parseUserStatus({ status: "active" }), "active");
  assert.equal(parseUserStatus({ status: "disabled" }), "disabled");
  assert.throws(() => parseUserStatus({ status: "invited" }), AuthInputError);
  assert.throws(
    () => parseUserStatus({ status: "active", extra: true }),
    AuthInputError,
  );
  assert.throws(() => parseUserStatus(null), AuthInputError);
});

test("setUserStatus prevents self-disable, non-superuser disabling superuser, and disabling last superuser", async () => {
  const adminId = "00000000-0000-0000-0000-000000000001";
  const managerId = "00000000-0000-0000-0000-000000000002";
  const missingId = "00000000-0000-0000-0000-000000000099";

  const state: MockState = {
    users: [
      {
        id: adminId,
        email: "admin@corp.local",
        status: "active",
        superuser: true,
      },
      {
        id: managerId,
        email: "mgr@corp.local",
        status: "active",
        superuser: false,
      },
    ],
    sessions: [],
    invitations: [],
    securityEvents: [],
  };
  const db = createMockDb(state);

  await assert.rejects(
    () =>
      setUserStatus(db, { id: adminId, superuser: true }, adminId, "disabled"),
    AuthConflictError,
  );
  await assert.rejects(
    () =>
      setUserStatus(
        db,
        { id: managerId, superuser: false },
        adminId,
        "disabled",
      ),
    AccessDeniedError,
  );
  await assert.rejects(
    () =>
      setUserStatus(
        db,
        { id: adminId, superuser: true },
        missingId,
        "disabled",
      ),
    UserNotFoundError,
  );

  // Even another superuser cannot disable when only 1 active superuser exists.
  const otherAdminId = "00000000-0000-0000-0000-000000000003";
  await assert.rejects(
    () =>
      setUserStatus(
        db,
        { id: otherAdminId, superuser: true },
        adminId,
        "disabled",
      ),
    AuthConflictError,
  );
});

test("setUserStatus revokes active sessions on disable, allows re-enable, and blocks activating invited users", async () => {
  const adminId = "00000000-0000-0000-0000-000000000001";
  const userId = "00000000-0000-0000-0000-000000000002";
  const invitedId = "00000000-0000-0000-0000-000000000003";

  const state: MockState = {
    users: [
      {
        id: adminId,
        email: "admin@corp.local",
        status: "active",
        superuser: true,
      },
      {
        id: userId,
        email: "user@corp.local",
        status: "active",
        superuser: false,
      },
      {
        id: invitedId,
        email: "new@corp.local",
        status: "active",
        superuser: false,
      },
    ],
    sessions: [
      { id: "s1", user_id: userId, revoked_at: null },
      { id: "s2", user_id: userId, revoked_at: null },
      { id: "s3", user_id: adminId, revoked_at: null },
    ],
    invitations: [{ user_id: invitedId, consumed_at: null }],
    securityEvents: [],
  };
  const db = createMockDb(state);

  await assert.rejects(
    () =>
      setUserStatus(db, { id: adminId, superuser: true }, invitedId, "active"),
    AuthConflictError,
  );

  const disabled = await setUserStatus(
    db,
    { id: adminId, superuser: true },
    userId,
    "disabled",
  );
  assert.equal(disabled.status, "disabled");
  assert.equal(
    state.sessions.filter((s) => s.user_id === userId && s.revoked_at === null)
      .length,
    0,
  );
  assert.equal(state.sessions.find((s) => s.id === "s3")?.revoked_at, null);
  assert.equal(state.securityEvents[0]?.action, "user.disabled");

  const reenabled = await setUserStatus(
    db,
    { id: adminId, superuser: true },
    userId,
    "active",
  );
  assert.equal(reenabled.status, "active");
  assert.equal(state.securityEvents[1]?.action, "user.enabled");
});
