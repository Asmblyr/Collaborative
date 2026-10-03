import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";

test("ordinary editors can upload and attach files with explicit grants; read-only and revoked grants reject mutations", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const bytes = new Map<string, Buffer>();
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    fileStorage: {
      id: "test:editor",
      async put(key, data) {
        bytes.set(key, data);
      },
      async get(key) {
        return Readable.from(bytes.get(key)!);
      },
      async delete(key) {
        bytes.delete(key);
      },
    },
  });
  try {
    const users = await db("public.asmblyr_users")
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
    const call = (
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: string,
      actor: number,
      payload?: object,
    ) => app.inject({ method, url, headers: headers[actor], payload });
    const collection = `editor_files_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const created = await call("POST", "/collections", 0, {
      name: collection,
      fields: [
        { name: "title", type: "text" },
        { name: "attachment", type: "file" },
      ],
    });
    assert.equal(created.statusCode, 201, created.body);
    const policy = (
      await call("POST", "/policies", 0, { name: "File editor" })
    ).json().data.id;
    await call("PUT", `/policies/${policy}/users`, 0, {
      userIds: [users[1].id],
    });
    const grant = async (input: object) => {
      const response = await call("POST", "/permissions", 0, input);
      assert.equal(response.statusCode, 201, response.body);
      const id = response.json().data.id;
      const assigned = await call(
        "PUT",
        `/policies/${policy}/permissions/${id}`,
        0,
      );
      assert.equal(assigned.statusCode, 204, assigned.body);
      return id;
    };
    await grant({ collection, action: "create", fields: ["*"] });
    await grant({ collection, action: "read", fields: ["*"] });
    const fileRead = await grant({
      section: "files",
      action: "read",
      fields: ["*"],
    });
    assert.equal((await call("GET", "/files", 1)).statusCode, 200);
    assert.equal((await call("POST", "/files", 1)).statusCode, 403);
    const fileUpdate = await grant({
      section: "files",
      action: "update",
      fields: ["*"],
    });
    const upload = await app.inject({
      method: "POST",
      url: "/files",
      headers: {
        ...headers[1],
        "content-type": "application/octet-stream",
        "x-file-name": "editor.txt",
      },
      payload: Buffer.from("editor file"),
    });
    assert.equal(upload.statusCode, 201, upload.body);
    const id = upload.json().data.id;
    const item = await call("POST", `/items/${collection}`, 1, {
      title: "Entry",
      attachment: id,
    });
    assert.equal(item.statusCode, 201, item.body);
    assert.equal(
      (await call("GET", `/files/${id}/content`, 1)).body,
      "editor file",
    );
    assert.equal(
      (await call("GET", `/files/${id}/content`, 2)).statusCode,
      404,
    );
    assert.equal((await call("DELETE", `/files/${id}`, 1)).statusCode, 409);
    await call("DELETE", `/policies/${policy}/permissions/${fileUpdate}`, 0);
    assert.equal(
      (await call("PATCH", `/files/${id}`, 1, { title: "Blocked" })).statusCode,
      403,
    );
    await call("DELETE", `/policies/${policy}/permissions/${fileRead}`, 0);
    assert.equal((await call("GET", "/files", 1)).statusCode, 403);
    assert.equal(
      (await call("GET", `/files/${id}/content`, 1)).statusCode,
      200,
    );
    assert.equal(
      (
        await call("POST", `/items/${collection}`, 1, {
          title: "No library",
          attachment: id,
        })
      ).statusCode,
      403,
    );
    await assert.rejects(
      db("public.asmblyr_permissions").insert({
        collection_id: null,
        section: null,
        action: "read",
        fields: ["*"],
      }),
    );
  } finally {
    await app.close();
    await db.destroy();
  }
});
