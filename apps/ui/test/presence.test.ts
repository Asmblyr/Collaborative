import assert from "node:assert/strict";
import test from "node:test";
import type { PresenceResult } from "@asmblyr-collaborative/contracts";
import { createPresenceSession } from "../src/components/presence/presence-session";

const result: PresenceResult = {
  data: {
    total: 1,
    participants: [
      {
        id: "test",
        displayName: "Участник",
        pictureUrl: null,
        self: true,
        views: 1,
      },
    ],
  },
};

test("closing during a heartbeat releases both before and after the late registration", async () => {
  let resolve!: (value: PresenceResult) => void;
  let calls = 0;
  let leaves = 0;
  const updates: unknown[] = [];
  const session = createPresenceSession(
    () => {
      calls += 1;
      return new Promise((done) => {
        resolve = done;
      });
    },
    async () => {
      leaves += 1;
    },
    (value) => updates.push(value),
  );
  const pending = session.refresh();
  await session.refresh();
  assert.equal(calls, 1);
  session.dispose();
  session.dispose();
  assert.equal(leaves, 1);
  resolve(result);
  await pending;
  assert.equal(leaves, 2);
  assert.deepEqual(updates, []);
  await session.refresh();
  assert.equal(calls, 1);
});

test("offline presence clears stale people, can recover, and cleanup failure is harmless", async () => {
  let offline = false;
  const updates: unknown[] = [];
  const session = createPresenceSession(
    async () => {
      if (offline) {
        throw new Error("offline");
      }
      return result;
    },
    async () => {
      throw new Error("offline");
    },
    (value) => updates.push(value),
  );
  await session.refresh();
  offline = true;
  await session.refresh();
  offline = false;
  await session.refresh();
  session.dispose();
  assert.deepEqual(updates, [result, null, result]);
});
