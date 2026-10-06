import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { notificationFixture as fixture } from "./support/notification-fixture.js";
import { createApp } from "../src/app.js";
test("inbox is private, follows record access, persists read state and opens the actual comment", async (t) => {
  const f = await fixture(t);
  const target = `/comments/${f.collection}/1`;
  await f.call("GET", "/notifications", undefined, 401, null);
  await f.call(
    "GET",
    `${target}/subscription`,
    undefined,
    403,
    f.outsiderToken,
  );
  await f.call(
    "PUT",
    `${target}/subscription`,
    { enabled: true },
    403,
    f.outsiderToken,
  );
  await f.call(
    "PUT",
    `${target}/subscription`,
    { enabled: true, userId: f.admin.id },
    400,
    f.memberToken,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        `${target}/subscription`,
        undefined,
        200,
        f.memberToken,
      )
    ).enabled,
    false,
  );
  await f.call(
    "PUT",
    `${target}/subscription`,
    { enabled: true },
    200,
    f.memberToken,
  );
  const commentBody = `${" ".repeat(300)}Review the new title`;
  const comment = (await f.call("POST", target, { body: commentBody }, 201))
    .data;
  assert.equal(comment.body, "Review the new title");
  const inbox = await f.call(
    "GET",
    "/notifications",
    undefined,
    200,
    f.memberToken,
  );
  assert.equal(inbox.unread, 1);
  assert.equal(inbox.total, 1);
  assert.equal(inbox.data[0].targetId, comment.id);
  assert.equal(inbox.data[0].panelId, "discussion");
  assert.equal(inbox.data[0].source, "comments");
  assert.equal(inbox.data[0].preview, "Review the new title");
  assert.equal(JSON.stringify(inbox).includes("classified"), false);
  assert.equal(
    (
      await f.call(
        "GET",
        `${target}/${comment.id}`,
        undefined,
        200,
        f.memberToken,
      )
    ).data.id,
    comment.id,
  );
  await f.call(
    "GET",
    `/comments/${f.collection}/2/${comment.id}`,
    undefined,
    404,
    f.memberToken,
  );
  assert.equal((await f.call("GET", "/notifications")).unread, 0);
  await f.call(
    "POST",
    `/notifications/${inbox.data[0].id}/read`,
    {},
    404,
    f.outsiderToken,
  );
  await f.call(
    "POST",
    `/notifications/${inbox.data[0].id}/read`,
    {},
    204,
    f.memberToken,
  );
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .unread,
    0,
  );
  await f.call("PATCH", `${target}/${comment.id}`, {
    body: `${" ".repeat(300)}Corrected excerpt`,
  });
  const edited = await f.call(
    "GET",
    "/notifications",
    undefined,
    200,
    f.memberToken,
  );
  assert.equal(edited.data[0].preview, "Corrected excerpt");
  assert.equal(edited.unread, 0);
  await f.call("DELETE", `${target}/${comment.id}`, undefined, 204);
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .total,
    0,
  );
});

test("auto-subscription respects mute, excludes self, snapshots all-read and deduplicates events", async (t) => {
  const f = await fixture(t);
  const target = `/comments/${f.collection}/1`;
  await f.call(
    "POST",
    target,
    { body: "First participation" },
    201,
    f.memberToken,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        `${target}/subscription`,
        undefined,
        200,
        f.memberToken,
      )
    ).enabled,
    true,
  );
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .total,
    0,
  );
  const comment = (await f.call("POST", target, { body: "First reply" }, 201))
    .data;
  const event = {
    collection: f.collection,
    item: "1",
    eventId: comment.id,
    panelId: "discussion",
    targetId: comment.id,
    preview: comment.body,
  };
  await f.call("POST", "/comments/replay", event);
  const snapshot = await f.call(
    "GET",
    "/notifications",
    undefined,
    200,
    f.memberToken,
  );
  assert.equal(snapshot.total, 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  await f.call("POST", target, { body: "Reply after snapshot" }, 201);
  await f.call(
    "POST",
    "/notifications/read-all",
    { before: snapshot.readBefore },
    204,
    f.memberToken,
  );
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .unread,
    1,
  );
  await f.call(
    "PUT",
    `${target}/subscription`,
    { enabled: false },
    200,
    f.memberToken,
  );
  await f.call(
    "POST",
    target,
    { body: "Muted participation" },
    201,
    f.memberToken,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        `${target}/subscription`,
        undefined,
        200,
        f.memberToken,
      )
    ).enabled,
    false,
  );
  await f.call("POST", target, { body: "No delivery after mute" }, 201);
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .total,
    2,
  );
  await f.call(
    "GET",
    "/notifications?limit=201",
    undefined,
    400,
    f.memberToken,
  );
  await f.call(
    "POST",
    "/notifications/read-all",
    { before: "2999-01-01T00:00:00.000Z" },
    400,
    f.memberToken,
  );
});

test("revocation, disabled plugins and deleted records hide both previews and unread counts", async (t) => {
  const f = await fixture(t);
  const target = `/comments/${f.collection}/1`;
  await f.call(
    "PUT",
    `${target}/subscription`,
    { enabled: true },
    200,
    f.memberToken,
  );
  await f.call("POST", target, { body: "Private to readers" }, 201);
  const notice = (
    await f.call("GET", "/notifications", undefined, 200, f.memberToken)
  ).data[0];
  await f.db("asmblyr_user_policies").where({ user_id: f.member.id }).delete();
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .total,
    0,
  );
  await f.call(
    "POST",
    `/notifications/${notice.id}/read`,
    {},
    404,
    f.memberToken,
  );
  await f.grant(f.collection, ["title"]);
  const withoutPlugins = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  t.after(() => withoutPlugins.close());
  const hidden = await withoutPlugins.inject({
    url: "/notifications",
    headers: { authorization: `Bearer ${f.memberToken}` },
  });
  assert.equal(hidden.statusCode, 200);
  assert.equal(hidden.json().unread, 0);
  await f.call("DELETE", `/items/${f.collection}/1`, undefined, 204);
  assert.equal(
    (await f.call("GET", "/notifications", undefined, 200, f.memberToken))
      .total,
    0,
  );
  assert.equal(
    (
      await f
        .db("asmblyr_notification_subscriptions")
        .where({ user_id: f.member.id, item: "1" })
    ).length,
    0,
  );
});
