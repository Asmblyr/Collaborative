import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { issueUserTokens } from "../src/auth/tokens.js";

test("files BFF: origin, permissions and authenticated library", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const origin = "http://127.0.0.1:3000";
  const users = await db("asmblyr_users").insert([true, false].map((superuser) => ({
    email: `${randomUUID()}@example.test`, superuser,
  }))).returning("id");
  const tokens = await Promise.all(users.map((u) => issueUserTokens(db, u.id)));
  const cookie = (index = 0) => `asmblyr_access=${tokens[index].accessToken}; asmblyr_refresh=${tokens[index].refreshToken}`;
  try {
    for (const path of ["/api/files", `/api/files/${randomUUID()}/content`]) {
      assert.equal((await fetch(origin + path)).status, 401);
      assert.equal((await fetch(origin + path, { headers: { cookie: cookie(1) } })).status, 403);
    }
    const noAccessUpload = await fetch(`${origin}/api/files`, { method: "POST", body: "test", headers: {
      origin, cookie: cookie(1), "content-type": "application/octet-stream", "x-file-name": "denied.txt",
    } });
    assert.equal(noAccessUpload.status, 403);
    for (const [method, path, contentType] of [["POST", "/api/files", "application/octet-stream"],
      ["PATCH", `/api/files/${randomUUID()}`, "application/json"], ["DELETE", `/api/files/${randomUUID()}`, undefined]] as const) {
      const response = await fetch(origin + path, { method, headers: { cookie: cookie(), origin: "https://foreign.example",
        ...(contentType ? { "content-type": contentType } : {}) }, body: method === "DELETE" ? undefined : "{}" });
      assert.equal(response.status, 403);
    }
    const page = await fetch(`${origin}/files`, { headers: { cookie: cookie() } });
    assert.equal(page.status, 200); assert.ok((await page.text()).includes("Библиотека файлов"));
    const list = await fetch(`${origin}/api/files`, { headers: { cookie: cookie() } });
    assert.equal(list.status, 200); assert.ok(Array.isArray((await list.json()).data));
  } finally {
    await db("asmblyr_users").whereIn("id", users.map((u) => u.id)).delete();
    await db.destroy();
  }
});

test("files BFF + real storage: upload, refresh, download, edit, delete", {
  skip: process.env.TEST_FILES_CLOUD !== "1",
}, async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const origin = "http://127.0.0.1:3000";
  const [user] = await db("asmblyr_users").insert({ email: `${randomUUID()}@example.test`, superuser: true }).returning("id");
  const tokens = await issueUserTokens(db, user.id);
  let cookie = `asmblyr_access=${tokens.accessToken}; asmblyr_refresh=${tokens.refreshToken}`;
  let fileId: string | undefined;
  const bytes = Buffer.from(`Asmblyr real storage test ${randomUUID()}`);
  try {
    const response = await fetch(`${origin}/api/files`, { method: "POST", body: bytes, headers: {
      cookie, origin, "content-type": "application/octet-stream", "x-file-name": "asmblyr-cloud-smoke.txt",
    } });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body)); fileId = body.data.id;
    // Force binary response down the refresh path without logging any cookie value.
    cookie = `asmblyr_access=expired; asmblyr_refresh=${tokens.refreshToken}`;
    const download = await fetch(`${origin}/api/files/${fileId}/content`, { headers: { cookie } });
    assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    const renewed = download.headers.getSetCookie().map((s) => s.split(";")[0]);
    assert.ok(renewed.some((s) => s.startsWith("asmblyr_access=")));
    cookie = renewed.join("; ");
    const patch = await fetch(`${origin}/api/files/${fileId}`, { method: "PATCH", headers: {
      cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ title: "Облачная проверка" }) });
    assert.equal(patch.status, 200);
    const remove = await fetch(`${origin}/api/files/${fileId}`, { method: "DELETE", headers: { cookie, origin } });
    assert.equal(remove.status, 204);
    assert.equal((await fetch(`${origin}/api/files/${fileId}/content`, { headers: { cookie } })).status, 404);
    fileId = undefined;
  } finally {
    // Clean up only this test actor's files, including a failed upload whose response lacked an ID.
    const created = await db("asmblyr_files").where({ uploaded_by: user.id }).select("id");
    for (const row of created) {
      const result = await fetch(`${origin}/api/files/${row.id}`, { method: "DELETE", headers: { cookie, origin } });
      if (result.status !== 204) throw new Error("Cloud test cleanup failed; file intent retained");
    }
    await db("asmblyr_file_events").where({ actor_id: user.id }).delete();
    await db("asmblyr_users").where({ id: user.id }).delete(); await db.destroy();
  }
});
