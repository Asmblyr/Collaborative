import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { MAX_FILE_BYTES } from "../src/files/validation.js";
import { StorageError, type FileStorage } from "../src/files/storage/types.js";

test("files: access, lifecycle, validation and recovery", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const users = await db("asmblyr_users").insert([true, false].map((superuser) => ({
    email: `${randomUUID()}@example.test`, superuser,
  }))).returning("id");
  const admin = (await issueUserTokens(db, users[0].id)).accessToken;
  const reader = (await issueUserTokens(db, users[1].id)).accessToken;
  const content = new Map<string, Buffer>();
  let failPut = false, failDelete = false, putCalls = 0;
  const storage: FileStorage = {
    id: "test:files", async put(key, bytes) {
      putCalls++; content.set(key, bytes);
      if (failPut) throw new StorageError();
    },
    async get(key) { const bytes = content.get(key); if (!bytes) throw new StorageError(); return Readable.from(bytes); },
    async delete(key) { if (failDelete) throw new StorageError(); content.delete(key); },
  };
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false, fileStorage: storage });
  const auth = { authorization: `Bearer ${admin}` };
  const prefix = `files-test-${randomUUID()}`;
  const upload = (filename: string, bytes = Buffer.from("sample"), headers = {}) => app.inject({
    method: "POST", url: "/files", headers: { ...auth, "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent(filename), ...headers }, payload: bytes,
  });
  let fileId: string;
  try {
    await t.test("library requires superuser; unlinked files stay hidden and unauthenticated payload never reaches storage", async () => {
      const id = randomUUID();
      for (const token of [undefined, reader]) {
        const headers = token ? { authorization: `Bearer ${token}` } : {};
        for (const [method, url] of [["GET", "/files"], ["GET", `/files/${id}`], ["GET", `/files/${id}/content`],
          ["GET", `/files/${id}/events`], ["PATCH", `/files/${id}`], ["DELETE", `/files/${id}`], ["POST", "/files"]] as const) {
          const result = await app.inject({ method, url, headers });
          const readFile = method === "GET" && (url === `/files/${id}` || url === `/files/${id}/content`);
          assert.equal(result.statusCode, token ? readFile ? 404 : 403 : 401, result.body);
        }
      }
      assert.equal(putCalls, 0);
    });
    await t.test("upload, exact-byte download, safe metadata and immutable object identity", async () => {
      const bytes = Buffer.from([0, 1, 2, 127, 255]);
      const response = await upload(`${prefix}-тест.txt`, bytes);
      assert.equal(response.statusCode, 201, response.body);
      const file = response.json().data; fileId = file.id;
      assert.equal(file.size, bytes.length); assert.equal(file.status, "ready");
      assert.equal(file.storage, undefined); assert.equal(file.object_key, undefined);
      const download = await app.inject({ method: "GET", url: `/files/${fileId}/content`, headers: auth });
      assert.equal(download.statusCode, 200); assert.deepEqual(download.rawPayload, bytes);
      assert.equal(download.headers["x-content-type-options"], "nosniff");
      assert.match(String(download.headers["content-disposition"]), /^attachment;.*UTF-8/);
      const update = await app.inject({ method: "PATCH", url: `/files/${fileId}`, headers: auth,
        payload: { title: "Документ", description: "Описание" } });
      assert.equal(update.statusCode, 200, update.body);
      assert.equal(update.json().data.filename, file.filename);
      for (const payload of [{ storage: "elsewhere" }, { object_key: "other" }, { filename: "new" }, { status: "ready" }, { title: "" }]) {
        assert.equal((await app.inject({ method: "PATCH", url: `/files/${fileId}`, headers: auth, payload })).statusCode, 400);
      }
    });
    await t.test("raster preview detects content and rejects HTML/SVG even with forged MIME", async () => {
      const malicious = await upload(`${prefix}.svg`, Buffer.from('<svg onload="alert(1)"></svg>'), { "x-file-type": "image/png" });
      assert.equal(malicious.statusCode, 201, malicious.body);
      const id = malicious.json().data.id;
      assert.equal(malicious.json().data.previewable, false);
      const preview = await app.inject({ method: "GET", url: `/files/${id}/content?preview=1`, headers: auth });
      assert.equal(preview.statusCode, 400);
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVf8AAAAASUVORK5CYII=", "base64");
      const raster = (await upload(`${prefix}.png`, png)).json().data;
      const image = await app.inject({ method: "GET", url: `/files/${raster.id}/content?preview=1`, headers: auth });
      assert.equal(image.headers["content-type"], "image/png"); assert.deepEqual(image.rawPayload, png);
    });
    await t.test("invalid names/types and oversized content are rejected before any object PUT", async () => {
      const before = putCalls;
      for (const name of ["../x", "a\\b", "\r\nx", "..", "a".repeat(256)]) {
        assert.equal((await upload(name)).statusCode, 400);
      }
      assert.equal((await upload("x", undefined, { "x-file-name": "%invalid" })).statusCode, 400);
      assert.equal((await upload("x", undefined, { "x-file-type": "invalid" })).statusCode, 400);
      assert.equal((await upload("x", Buffer.alloc(MAX_FILE_BYTES + 1))).statusCode, 413);
      assert.equal(putCalls, before);
      assert.equal((await app.inject({ method: "GET", url: "/files?limit=10000", headers: auth })).statusCode, 400);
    });
    await t.test("search treats SQL wildcards literally and pagination is bounded", async () => {
      await upload(`${prefix}-100%.txt`);
      const page = await app.inject({ method: "GET", url: `/files?search=${encodeURIComponent(prefix)}&limit=1`, headers: auth });
      assert.equal(page.statusCode, 200); assert.equal(page.json().data.length, 1); assert.ok(page.json().meta.total >= 4);
      const percent = await app.inject({ method: "GET", url: `/files?search=${encodeURIComponent(`${prefix}-100%`)}`, headers: auth });
      assert.equal(percent.json().meta.total, 1);
    });
    await t.test("ambiguous upload failure retains a cleanable record and no success audit", async () => {
      failPut = true;
      assert.equal((await upload(`${prefix}-failed.txt`)).statusCode, 503);
      failPut = false;
      const failed = await db("asmblyr_files").where({ filename: `${prefix}-failed.txt` }).first();
      assert.equal(failed.status, "failed"); assert.ok(content.has(failed.object_key));
      assert.equal((await db("asmblyr_file_events").where({ file_id: failed.id })).length, 0);
      const result = await app.inject({ method: "DELETE", url: `/files/${failed.id}`, headers: auth });
      assert.equal(result.statusCode, 204); assert.ok(!content.has(failed.object_key));
    });
    await t.test("failed deletion hides content, survives retry, and audits exactly once", async () => {
      failDelete = true;
      assert.equal((await app.inject({ method: "DELETE", url: `/files/${fileId}`, headers: auth })).statusCode, 503);
      assert.equal((await db("asmblyr_files").where({ id: fileId }).first()).status, "deleting");
      assert.equal((await app.inject({ method: "GET", url: `/files/${fileId}/content`, headers: auth })).statusCode, 404);
      failDelete = false;
      for (let i = 0; i < 2; i++) {
        assert.equal((await app.inject({ method: "DELETE", url: `/files/${fileId}`, headers: auth })).statusCode, 204);
      }
      const events = (await app.inject({ method: "GET", url: `/files/${fileId}/events`, headers: auth })).json().data;
      assert.deepEqual(events.map((e: { action: string }) => e.action), ["delete", "update", "create"]);
      assert.ok(events.every((e: { actorId: string }) => e.actorId === users[0].id));
    });
    await t.test("bucket configuration mismatch never reads or deletes an unrelated object", async () => {
      const id = (await upload(`${prefix}-mismatch.txt`)).json().data.id;
      await db("asmblyr_files").where({ id }).update({ storage: "other:bucket" });
      assert.equal((await app.inject({ method: "GET", url: `/files/${id}/content`, headers: auth })).statusCode, 503);
      assert.equal((await app.inject({ method: "DELETE", url: `/files/${id}`, headers: auth })).statusCode, 503);
      assert.equal((await db("asmblyr_files").where({ id }).first()).status, "ready");
    });
    await t.test("reserved structure and generic items routes cannot modify file records", async () => {
      assert.ok([400, 403].includes((await app.inject({ method: "POST", url: "/collections", headers: auth,
        payload: { name: "asmblyr_files", fields: [] } })).statusCode));
      assert.ok([400, 403, 404].includes((await app.inject({ method: "GET", url: "/items/asmblyr_files", headers: auth })).statusCode));
    });
    await t.test("missing storage keeps listing available, rejects uploads without creating records", async () => {
      const disabled = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
      try {
        const listed = await disabled.inject({ method: "GET", url: "/files", headers: auth });
        assert.equal(listed.json().meta.storageConfigured, false);
        const response = await disabled.inject({ method: "POST", url: "/files", headers: {
          ...auth, "content-type": "application/octet-stream", "x-file-name": "not-created" }, payload: "x" });
        assert.equal(response.statusCode, 503);
      } finally { await disabled.close(); }
    });
  } finally {
    await db("asmblyr_file_events").where({ actor_id: users[0].id }).delete();
    await db("asmblyr_files").where({ uploaded_by: users[0].id }).delete();
    await db("asmblyr_users").whereIn("id", users.map((u) => u.id)).delete();
    await app.close(); await db.destroy();
  }
});
