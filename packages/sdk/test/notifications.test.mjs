import assert from "node:assert/strict";
import test from "node:test";
import { createClient, ApiError } from "../dist/index.js";

test("notification client preserves read snapshot and encodes an ID within its own path", async () => {
  const calls = [];
  const snapshot = {
    data: [],
    unread: 0,
    total: 0,
    readBefore: "2026-10-05T00:00:00.000Z",
  };
  const client = createClient({
    baseUrl: "/api",
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return init.method === "GET"
        ? Response.json(snapshot)
        : new Response(null, { status: 204 });
    },
  });
  const result = await client.notifications.list(100);
  assert.deepEqual(result, snapshot);
  await client.notifications.read("unsafe/id?#");
  await client.notifications.readAll(result.readBefore);
  assert.deepEqual(calls, [
    { url: "/api/notifications?limit=100", method: "GET", body: undefined },
    {
      url: "/api/notifications/unsafe%2Fid%3F%23/read",
      method: "POST",
      body: "{}",
    },
    {
      url: "/api/notifications/read-all",
      method: "POST",
      body: JSON.stringify({ before: snapshot.readBefore }),
    },
  ]);
  const denied = createClient({
    baseUrl: "/api",
    fetch: async () =>
      Response.json({ message: "Permission denied" }, { status: 403 }),
  });
  await assert.rejects(denied.notifications.list(), ApiError);
});
