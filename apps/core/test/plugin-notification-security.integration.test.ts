import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { notificationFixture as fixture } from "./support/notification-fixture.js";
import { randomUUID } from "node:crypto";
test("inbox retention is bounded and concurrent duplicate delivery is idempotent", async (t) => {
  const f = await fixture(t);
  await f.call(
    "PUT",
    `/comments/${f.collection}/1/subscription`,
    { enabled: true },
    200,
    f.memberToken,
  );
  const collection = await f
    .db("asmblyr_collections")
    .where({ name: f.collection })
    .first("id");
  await f.db("asmblyr_notifications").insert(
    Array.from({ length: 200 }, (_, i) => ({
      user_id: f.member.id,
      collection_id: collection.id,
      item: "1",
      source: "comments",
      event_id: randomUUID(),
      panel_id: "discussion",
      target_id: randomUUID(),
      preview: `Older ${i}`,
      created_at: new Date(Date.now() - 60_000 - i * 100),
    })),
  );
  const event = {
    collection: f.collection,
    item: "1",
    eventId: randomUUID(),
    panelId: "discussion",
    targetId: randomUUID(),
    preview: "Concurrent event",
  };
  await Promise.all([
    f.call("POST", "/comments/replay", event),
    f.call("POST", "/comments/replay", event),
  ]);
  const inbox = await f.call(
    "GET",
    "/notifications?limit=200",
    undefined,
    200,
    f.memberToken,
  );
  assert.equal(inbox.total, 200);
  assert.equal(
    inbox.data.filter(
      (item: { preview: string }) => item.preview === "Concurrent event",
    ).length,
    1,
  );
});

test("delivery obeys row permissions, inactive accounts and transactional rollback", async (t) => {
  const f = await fixture(t);
  const target = `/comments/${f.collection}/1`;
  await f.call(
    "PUT",
    `${target}/subscription`,
    { enabled: true },
    200,
    f.memberToken,
  );
  await f.call(
    "POST",
    "/comments/rollback",
    { collection: f.collection, item: "1" },
    500,
  );
  assert.equal((await f.call("GET", target)).page.total, "0");
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .total,
    0,
  );
  await f.db("asmblyr_user_policies").where({ user_id: f.member.id }).delete();
  await f.call(
    "POST",
    "/policies",
    {
      name: `Row scope ${randomUUID()}`,
      userIds: [f.member.id],
      permissions: [
        {
          collection: f.collection,
          action: "read",
          fields: ["title"],
          rowFilter: {
            logic: "and",
            children: [
              {
                field: "title",
                op: "eq",
                value: { kind: "literal", value: "Bravo" },
              },
            ],
          },
        },
      ],
    },
    201,
  );
  await f.call("POST", target, { body: "Inside scope" }, 201);
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .unread,
    1,
  );
  await f.call("PATCH", `/items/${f.collection}/1`, { title: "Outside scope" });
  await f.call("POST", target, { body: "Outside scope" }, 201);
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .total,
    0,
  );
  assert.equal(
    (await f.db("asmblyr_notifications").where({ user_id: f.member.id }))
      .length,
    1,
  );
  await f.call("PATCH", `/items/${f.collection}/1`, { title: "Bravo" });
  await f
    .db("asmblyr_users")
    .where({ id: f.member.id })
    .update({ status: "disabled" });
  await f.call("POST", target, { body: "No delivery to disabled user" }, 201);
  assert.equal(
    (await f.db("asmblyr_notifications").where({ user_id: f.member.id }))
      .length,
    1,
  );
  const service = (
    await f.call(
      "POST",
      "/service-accounts",
      { name: "Notification author" },
      201,
    )
  ).data;
  const key = (
    await f.call(
      "POST",
      `/service-accounts/${service.id}/keys`,
      { name: "Test" },
      201,
    )
  ).data;
  const serviceToken = (
    await f.call("POST", "/auth/service-token", { key: key.secret }, 200, null)
  ).accessToken;
  await f.call("GET", "/notifications", undefined, 403, serviceToken);
  await f.call(
    "POST",
    "/notifications/read-all",
    { before: new Date().toISOString() },
    403,
    serviceToken,
  );
});
