import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryRealtimeBus } from "../src/realtime/bus.js";
import { realtimeEvent } from "../src/realtime/publish.js";
import { parseLockInput } from "../src/realtime/locks.js";

test("in-memory bus stops delivery after unsubscribe and close", async () => {
  const bus = new InMemoryRealtimeBus();
  const received: string[] = [];
  const unsubscribe = bus.subscribe(
    { kind: "collection", collection: "demo" },
    (event) => received.push(event.id),
  );
  const event = realtimeEvent("collection.changed", null, {
    collection: "demo",
  });
  bus.publish(event);
  unsubscribe();
  bus.publish(event);
  assert.deepEqual(received, [event.id]);
  await bus.close();
  bus.publish(event);
  assert.deepEqual(received, [event.id]);
});

test("in-memory bus routes events to their scope once", async () => {
  const bus = new InMemoryRealtimeBus();
  const collection: string[] = [];
  const record: string[] = [];
  const other: string[] = [];
  bus.subscribe({ kind: "collection", collection: "demo" }, (event) =>
    collection.push(event.type),
  );
  bus.subscribe({ kind: "record", collection: "demo", id: "7" }, (event) =>
    record.push(event.type),
  );
  bus.subscribe({ kind: "collection", collection: "other" }, (event) =>
    other.push(event.type),
  );
  await bus.publish(
    realtimeEvent("record.updated", null, {
      collection: "demo",
      recordId: "7",
      changedFields: ["title"],
      revision: "9",
    }),
  );
  await bus.publish(
    realtimeEvent("presence.changed", null, {
      scope: { kind: "record", collection: "demo", id: "7" },
      participants: [],
      total: 0,
    }),
  );
  await bus.publish(
    realtimeEvent("field.locked", null, {
      collection: "demo",
      recordId: "7",
      field: "title",
      holder: { id: "editor", displayName: "Editor" },
      expiresAt: new Date().toISOString(),
    }),
  );
  await bus.publish(
    realtimeEvent("collection.changed", null, { collection: "" }),
  );
  assert.deepEqual(collection, ["record.updated", "collection.changed"]);
  assert.deepEqual(record, [
    "record.updated",
    "presence.changed",
    "field.locked",
    "collection.changed",
  ]);
  assert.deepEqual(other, ["collection.changed"]);
});

test("lock input rejects unbounded IDs and unknown fields before database work", () => {
  const valid = {
    collection: "articles",
    recordId: "4",
    field: "title",
    clientId: "00000000-0000-4000-8000-000000000001",
  };
  assert.deepEqual(parseLockInput(valid), valid);
  assert.throws(() => parseLockInput({ ...valid, recordId: "x".repeat(256) }), {
    statusCode: 400,
  });
  assert.throws(() => parseLockInput({ ...valid, sessionId: valid.clientId }), {
    statusCode: 400,
  });
  assert.throws(() => parseLockInput({ ...valid, field: "title;DROP TABLE" }), {
    statusCode: 400,
  });
});
