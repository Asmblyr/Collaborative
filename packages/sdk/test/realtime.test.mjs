import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../dist/index.js";

function frame(event) {
  return `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
}

test("realtime reconnects, restores scope and ignores duplicate IDs", async (t) => {
  const seen = [];
  const invalidations = [];
  const states = [];
  const scope = { kind: "record", collection: "articles", id: "4" };
  const event = {
    id: "once",
    type: "record.updated",
    timestamp: new Date().toISOString(),
    workspaceId: null,
    actor: { kind: "user", id: "other" },
    payload: {
      collection: "articles",
      recordId: "4",
      changedFields: ["title"],
      revision: "5",
    },
  };
  let requests = 0;
  const client = createClient({
    baseUrl: "https://example.test/api",
    accessToken: "token",
    fetch: async (url, init) => {
      requests += 1;
      const parsed = new URL(url);
      assert.equal(parsed.pathname, "/api/realtime/stream");
      assert.deepEqual(JSON.parse(parsed.searchParams.get("scope")), scope);
      assert.equal(init.headers.get("authorization"), "Bearer token");
      const text =
        requests === 1
          ? frame(event)
          : frame(event) + frame({ ...event, id: "new" });
      const bytes = new TextEncoder().encode(text);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, 17));
            controller.enqueue(bytes.slice(17));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const live = client.realtime.connect();
  t.after(() => live.close());
  live.on("collection.changed", (event) => invalidations.push(event));
  const offState = live.onState((state) => states.push(state));
  const unsubscribe = live.subscribe(scope, (received) => seen.push(received));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Reconnect timed out")),
      3000,
    );
    const check = setInterval(() => {
      if (seen.some((entry) => entry.id === "new")) {
        clearInterval(check);
        clearTimeout(timeout);
        resolve();
      }
    }, 10);
  });
  unsubscribe();
  offState();
  live.close();
  assert.equal(requests, 2);
  assert.equal(seen.filter((entry) => entry.id === "once").length, 1);
  assert.ok(seen.some((entry) => entry.type === "collection.changed"));
  const scopeInvalidations = seen.filter(
    (entry) => entry.type === "collection.changed",
  );
  assert.equal(scopeInvalidations.length, 1);
  assert.deepEqual(invalidations, scopeInvalidations);
  assert.deepEqual(invalidations[0].payload, { collection: "articles" });
  assert.ok(states.includes("reconnecting"));
  assert.equal(live.state, "offline");
});
