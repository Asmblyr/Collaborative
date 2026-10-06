import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("private raster avatars work without file-library rights and cannot be deleted while attached", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const content = new Map<string, Buffer>();
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    fileStorage: {
      id: "test:avatars",
      async put(key, bytes) {
        content.set(key, bytes);
      },
      async get(key) {
        return Readable.from(content.get(key)!);
      },
      async delete(key) {
        content.delete(key);
      },
    },
  });
  const users = await db("asmblyr_users")
    .insert(
      [true, false, false].map((superuser) => ({
        email: `${randomUUID()}@example.test`,
        superuser,
      })),
    )
    .returning("id");
  const headers = await Promise.all(
    users.map(async (user) => ({
      authorization: `Bearer ${(await issueUserTokens(db, user.id)).accessToken}`,
    })),
  );
  t.after(async () => {
    await app.close();
    await db("asmblyr_users")
      .whereIn(
        "id",
        users.map((user) => user.id),
      )
      .update({ avatar_id: null });
    await db("asmblyr_files")
      .whereIn(
        "uploaded_by",
        users.map((user) => user.id),
      )
      .delete();
    await db("asmblyr_users")
      .whereIn(
        "id",
        users.map((user) => user.id),
      )
      .delete();
    await db.destroy();
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = (payload: Buffer, authenticated = true) =>
    app.inject({
      method: "POST",
      url: "/users/me/avatar",
      headers: {
        ...(authenticated ? headers[1] : {}),
        "content-type": "application/octet-stream",
        "x-file-name": "avatar.png",
        "x-file-type": "image/png",
      },
      payload,
    });
  assert.equal((await upload(png, false)).statusCode, 401);
  assert.equal((await upload(Buffer.from("fake png"))).statusCode, 400);
  assert.equal(
    (await upload(Buffer.alloc(2 * 1024 * 1024 + 1))).statusCode,
    413,
  );
  const file = await upload(png);
  assert.equal(file.statusCode, 201, file.body);
  const avatarId = file.json().data.id;
  const saved = await app.inject({
    method: "PATCH",
    url: "/users/me",
    headers: headers[1],
    payload: { avatarId },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().data.avatarId, avatarId);
  assert.equal(saved.json().data.pictureUrl, null);
  const preview = await app.inject({
    method: "GET",
    url: `/files/${avatarId}/content?preview=1`,
    headers: headers[1],
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.headers["content-type"], "image/png");
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/files/${avatarId}/content?preview=1`,
        headers: headers[2],
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: `/files/public/${avatarId}/content`,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ method: "GET", url: "/files", headers: headers[1] }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `/files/${avatarId}`,
        headers: headers[0],
      })
    ).statusCode,
    409,
  );
  const other = await app.inject({
    method: "PATCH",
    url: "/users/me",
    headers: headers[2],
    payload: { avatarId },
  });
  assert.equal(other.statusCode, 404, other.body);
  await app.inject({
    method: "PATCH",
    url: "/users/me",
    headers: headers[1],
    payload: { avatarId: null },
  });
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `/files/${avatarId}`,
        headers: headers[0],
      })
    ).statusCode,
    204,
  );
});
