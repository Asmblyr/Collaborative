import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";
import type { FileStorage } from "../../src/files/storage/types.js";
import { authorizeTestApp } from "./authorized-app.js";

export async function featureFixture() {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const objects = new Map<string, Buffer>();
  const storage: FileStorage = {
    id: "test:extended-fields",
    async put(key, bytes) {
      objects.set(key, bytes);
    },
    async get(key) {
      const value = objects.get(key);
      if (!value) throw new Error("Missing test object");
      return Readable.from(value);
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    fileStorage: storage,
  });
  const admin = await authorizeTestApp(app, db);
  const adminHeaders = {
    authorization: `Bearer ${(await issueUserTokens(db, admin.id)).accessToken}`,
  };
  const [member] = await db("asmblyr_users")
    .insert({ email: `${randomUUID()}@example.test` })
    .returning("id");
  const memberHeaders = {
    authorization: `Bearer ${(await issueUserTokens(db, member.id)).accessToken}`,
  };
  const prefix = `test_features_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const names: string[] = [],
    policies: string[] = [];
  const call = async (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
    status = 200,
    headers = adminHeaders,
  ) => {
    const response = await app.inject({ method, url, payload, headers });
    assert.equal(
      response.statusCode,
      status,
      `${method} ${url}: ${response.body}`,
    );
    return status === 204 ? undefined : response.json().data;
  };
  async function grant(name: string, action: string, fields = ["*"]) {
    const policy = await call(
      "POST",
      "/policies",
      { name: `${prefix}_${policies.length}` },
      201,
    );
    policies.push(policy.id);
    const permission = await call(
      "POST",
      "/permissions",
      { collection: name, action, fields },
      201,
    );
    await call(
      "PUT",
      `/policies/${policy.id}/permissions/${permission.id}`,
      undefined,
      204,
    );
    await call(
      "PUT",
      `/policies/${policy.id}/users/${member.id}`,
      undefined,
      204,
    );
    return policy.id as string;
  }
  async function close() {
    await db("asmblyr_workspaces").whereLike("name", `${prefix}%`).delete();
    for (const name of names) {
      await db.schema.withSchema("public").dropTableIfExists(name);
      await db("asmblyr_collections").where({ name }).delete();
      await db("asmblyr_item_events").where({ collection_name: name }).delete();
    }
    await db("asmblyr_policies").whereIn("id", policies).delete();
    await db("asmblyr_file_events").where({ actor_id: admin.id }).delete();
    await db("asmblyr_files").where({ uploaded_by: admin.id }).delete();
    await db("asmblyr_users").where({ id: member.id }).delete();
    await app.close();
    await db.destroy();
  }
  return {
    db,
    app,
    admin,
    adminHeaders,
    member,
    memberHeaders,
    prefix,
    names,
    call,
    grant,
    close,
  };
}
