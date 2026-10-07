import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@asmblyr-collaborative/sdk";
import type { RealtimeEvent } from "@asmblyr-collaborative/contracts";
import { createBrowserSession } from "../src/auth/browser/sessions.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";

function eventOf(
  type: RealtimeEvent["type"],
  subscribe: (callback: (event: RealtimeEvent) => void) => () => void,
) {
  let release: () => void = () => undefined;
  const result = new Promise<RealtimeEvent>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${type}`)),
      5000,
    );
    release = subscribe((event) => {
      if (event.type === type) {
        clearTimeout(timer);
        resolve(event);
      }
    });
  });
  return { result, release: () => release() };
}

test("realtime stream shares committed updates and enforces record access", async (t) => {
  const f = await pluginItemsFixture();
  let closeLive: (() => void) | null = null;
  t.after(async () => {
    closeLive?.();
    await f.close();
  });
  const url = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const client = createClient({ baseUrl: url, accessToken: f.memberToken });
  const live = client.realtime.connect();
  closeLive = () => live.close();
  const scope = { kind: "record" as const, collection: f.collection, id: "2" };
  const listeners = new Set<(event: RealtimeEvent) => void>();
  const listen = (callback: (event: RealtimeEvent) => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  };
  const connected = eventOf("presence.changed", listen);
  const unsubscribe = live.subscribe(scope, (event) => {
    for (const listener of listeners) listener(event);
  });
  await connected.result;
  const update = eventOf("record.updated", listen);
  await f.call("PATCH", `/items/${f.collection}/2`, { title: "Live change" });
  const received = await update.result;
  assert.equal(received.actor?.id, f.admin.id);
  if (received.type === "record.updated") {
    assert.equal(received.payload.recordId, "2");
    assert.ok(received.payload.changedFields.includes("title"));
    assert.ok(!received.payload.changedFields.includes("secret"));
    assert.match(received.payload.revision, /^\d+$/);
  }
  const deletion = eventOf("record.deleted", listen);
  await f.call("DELETE", `/items/${f.collection}/2`, undefined, 204);
  const deleted = await deletion.result;
  assert.equal(deleted.type, "record.deleted");
  deletion.release();
  connected.release();
  update.release();
  unsubscribe();

  const unauthorized = await fetch(
    `${url}/realtime/stream?${new URLSearchParams({ clientId: randomUUID(), scope: JSON.stringify(scope) })}`,
    {
      headers: { authorization: `Bearer ${f.outsiderToken}` },
    },
  );
  assert.equal(unauthorized.status, 403);
  await unauthorized.body?.cancel();
});

test("field locks are atomic, scoped to editor sessions and expire", async (t) => {
  const f = await pluginItemsFixture();
  let closeLive: (() => void) | null = null;
  t.after(async () => {
    closeLive?.();
    await f.close();
  });
  await f.grant(f.collection, ["title"], f.member.id, "update");
  const member = {
    collection: f.collection,
    recordId: "2",
    field: "title",
    clientId: randomUUID(),
  };
  const admin = { ...member, clientId: randomUUID() };
  await f.call("POST", "/realtime/locks", member, 200, f.memberToken);
  const url = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const live = createClient({
    baseUrl: url,
    accessToken: f.adminToken,
  }).realtime.connect();
  closeLive = () => live.close();
  const initialLock = eventOf("field.locked", (callback) =>
    live.subscribe(
      { kind: "record", collection: f.collection, id: "2" },
      callback,
    ),
  );
  const seen = await initialLock.result;
  assert.equal(
    seen.type === "field.locked" && seen.payload.holder.id,
    f.member.id,
  );
  initialLock.release();
  await f.call("POST", "/realtime/locks", admin, 409, f.adminToken);
  await f.call(
    "POST",
    "/realtime/locks",
    { ...member, field: "secret" },
    403,
    f.memberToken,
  );
  await f.call("POST", "/realtime/locks", member, 403, f.outsiderToken);
  await f.call("DELETE", "/realtime/locks", admin, 204, f.adminToken);
  assert.equal(
    (await f.db("asmblyr_field_locks").where({ field: "title" })).length,
    1,
  );
  await f
    .db("asmblyr_field_locks")
    .where({ field: "title" })
    .update({ expires_at: new Date(0) });
  await f.call("POST", "/realtime/locks", admin, 200, f.adminToken);
  await f.call("DELETE", "/realtime/locks", admin, 204, f.adminToken);
  assert.equal(
    (await f.db("asmblyr_field_locks").where({ field: "title" })).length,
    0,
  );
});

test("browser session reaches realtime routes through Core /api and enforces origin", async (t) => {
  const f = await pluginItemsFixture();
  t.after(f.close);
  const token = await createBrowserSession(
    f.db,
    await issueUserTokens(f.db, f.admin.id),
  );
  const url = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const input = {
    collection: f.collection,
    recordId: "2",
    field: "title",
    clientId: randomUUID(),
  };
  const headers = {
    cookie: `asmblyr_session=${token}`,
    "content-type": "application/json",
  };
  const lockUrl = `${url}/api/realtime/locks`;
  const denied = await fetch(lockUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  assert.equal(denied.status, 403);

  const browserHeaders = { ...headers, origin: "http://localhost:3000" };
  const acquired = await fetch(lockUrl, {
    method: "POST",
    headers: browserHeaders,
    body: JSON.stringify(input),
  });
  assert.equal(acquired.status, 200, await acquired.clone().text());

  const scope = JSON.stringify({
    kind: "record",
    collection: f.collection,
    id: "2",
  });
  const stream = await fetch(
    `${url}/api/realtime/stream?${new URLSearchParams({ clientId: input.clientId, scope })}`,
    { headers },
  );
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);
  await stream.body?.cancel();

  const released = await fetch(lockUrl, {
    method: "DELETE",
    headers: browserHeaders,
    body: JSON.stringify(input),
  });
  assert.equal(released.status, 204);
});
