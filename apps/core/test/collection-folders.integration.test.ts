import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("folders group collections without changing their data or access", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const name = `test_folder_collection_${Date.now()}`;
  const folderName = `Folder ${Date.now()}`;
  let folderId: string | undefined;
  let viewerId: string | undefined;

  try {
    const folder = await app.inject({
      method: "POST",
      url: "/folders",
      payload: { name: folderName },
    });
    assert.equal(folder.statusCode, 201, folder.body);
    folderId = folder.json().data.id;

    const invalidCreate = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name: `${name}_missing`,
        folderId: "00000000-0000-0000-0000-000000000001",
      },
    });
    assert.equal(invalidCreate.statusCode, 404, invalidCreate.body);
    assert.equal(
      await database.schema.withSchema("public").hasTable(`${name}_missing`),
      false,
    );

    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name, folderId },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.folderId, folderId);

    const listed = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(
      listed.json().data.find((entry: { name: string }) => entry.name === name)
        .folderId,
      folderId,
    );
    assert.ok(
      listed
        .json()
        .folders.some((entry: { id: string }) => entry.id === folderId),
    );

    const [viewer] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    viewerId = viewer.id;
    const viewerToken = (await issueUserTokens(database, viewerId)).accessToken;
    const viewerHeaders = { authorization: `Bearer ${viewerToken}` };
    const hidden = await app.inject({
      method: "GET",
      url: "/collections",
      headers: viewerHeaders,
    });
    assert.deepEqual(hidden.json().folders, []);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/folders",
          headers: viewerHeaders,
          payload: { name: "Forbidden" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/collections/${name}/folder`,
          headers: viewerHeaders,
          payload: { folderId: null },
        })
      ).statusCode,
      403,
    );

    const moved = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/folder`,
      payload: { folderId: null },
    });
    assert.equal(moved.statusCode, 200, moved.body);
    const invalid = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/folder`,
      payload: { folderId: "00000000-0000-0000-0000-000000000001" },
    });
    assert.equal(invalid.statusCode, 404, invalid.body);
    assert.equal(
      (
        await database("asmblyr_collections")
          .withSchema("public")
          .where({ name })
          .first("folder_id")
      ).folder_id,
      null,
    );

    const renamed = await app.inject({
      method: "PATCH",
      url: `/folders/${folderId}`,
      payload: { name: `${folderName} renamed` },
    });
    assert.equal(renamed.statusCode, 200, renamed.body);
    const movedBack = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/folder`,
      payload: { folderId },
    });
    assert.equal(movedBack.statusCode, 200, movedBack.body);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/folders/${folderId}`,
    });
    assert.equal(deleted.statusCode, 204, deleted.body);
    folderId = undefined;
    const after = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(
      after.json().data.find((entry: { name: string }) => entry.name === name)
        .folderId,
      null,
    );
    assert.equal(
      await database.schema.withSchema("public").hasTable(name),
      true,
    );
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .delete();
    if (folderId)
      await database("asmblyr_collection_folders")
        .withSchema("public")
        .where({ id: folderId })
        .delete();
    if (viewerId)
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: viewerId })
        .delete();
    await app.close();
    await database.destroy();
  }
});

test("collection order persists within folders and on folder deletion", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const prefix = `test_order_${Date.now()}`;
  const names = ["a", "b", "c", "root"].map((suffix) => `${prefix}_${suffix}`);
  const [a, b, c, root] = names;
  let folderId: string | undefined;

  async function ordered(folder: string | null) {
    const response = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(response.statusCode, 200, response.body);
    return (response.json().data as { name: string; folderId: string | null }[])
      .filter(
        (entry) => names.includes(entry.name) && entry.folderId === folder,
      )
      .map((entry) => entry.name);
  }

  try {
    const folder = await app.inject({
      method: "POST",
      url: "/folders",
      payload: { name: `Order ${Date.now()}` },
    });
    assert.equal(folder.statusCode, 201, folder.body);
    folderId = folder.json().data.id;
    for (const name of [a, b, c]) {
      const created = await app.inject({
        method: "POST",
        url: "/collections",
        payload: { name, folderId },
      });
      assert.equal(created.statusCode, 201, created.body);
    }
    const createdRoot = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name: root },
    });
    assert.equal(createdRoot.statusCode, 201, createdRoot.body);
    assert.deepEqual(await ordered(folderId), [a, b, c]);

    const reordered = await app.inject({
      method: "PATCH",
      url: `/collections/${c}/folder`,
      payload: { folderId, before: a },
    });
    assert.equal(reordered.statusCode, 200, reordered.body);
    assert.deepEqual(await ordered(folderId), [c, a, b]);

    const appended = await app.inject({
      method: "PATCH",
      url: `/collections/${c}/folder`,
      payload: { folderId, before: null },
    });
    assert.equal(appended.statusCode, 200, appended.body);
    assert.deepEqual(await ordered(folderId), [a, b, c]);
    const restoredOrder = await app.inject({
      method: "PATCH",
      url: `/collections/${c}/folder`,
      payload: { folderId, before: a },
    });
    assert.equal(restoredOrder.statusCode, 200, restoredOrder.body);
    assert.deepEqual(await ordered(folderId), [c, a, b]);

    const invalid = await app.inject({
      method: "PATCH",
      url: `/collections/${c}/folder`,
      payload: { folderId, before: root },
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.deepEqual(await ordered(folderId), [c, a, b]);

    const movedToRoot = await app.inject({
      method: "PATCH",
      url: `/collections/${a}/folder`,
      payload: { folderId: null, before: root },
    });
    assert.equal(movedToRoot.statusCode, 200, movedToRoot.body);
    assert.deepEqual(await ordered(null), [a, root]);
    assert.deepEqual(await ordered(folderId), [c, b]);

    const movedBack = await app.inject({
      method: "PATCH",
      url: `/collections/${root}/folder`,
      payload: { folderId, before: b },
    });
    assert.equal(movedBack.statusCode, 200, movedBack.body);
    assert.deepEqual(await ordered(folderId), [c, root, b]);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/folders/${folderId}`,
    });
    assert.equal(deleted.statusCode, 204, deleted.body);
    folderId = undefined;
    assert.deepEqual(await ordered(null), [a, c, root, b]);
  } finally {
    for (const name of names)
      await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections")
      .withSchema("public")
      .whereIn("name", names)
      .delete();
    if (folderId)
      await database("asmblyr_collection_folders")
        .withSchema("public")
        .where({ id: folderId })
        .delete();
    await app.close();
    await database.destroy();
  }
});

test("folder order persists and does not move collections between folders", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const prefix = `test_folder_order_${randomUUID().slice(0, 8)}`;
  const ids: string[] = [];
  const collectionName = `${prefix}_collection`;
  let viewerId: string | undefined;

  async function currentOrder() {
    const response = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(response.statusCode, 200, response.body);
    return (response.json().folders as { id: string }[])
      .map((folder) => folder.id)
      .filter((id) => ids.includes(id));
  }

  try {
    for (const suffix of ["a", "b", "c"]) {
      const response = await app.inject({
        method: "POST",
        url: "/folders",
        payload: { name: `${prefix}_${suffix}` },
      });
      assert.equal(response.statusCode, 201, response.body);
      ids.push(response.json().data.id);
    }
    const [a, b, c] = ids;
    assert.deepEqual(await currentOrder(), [a, b, c]);

    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name: collectionName, folderId: b },
    });
    assert.equal(created.statusCode, 201, created.body);

    const moved = await app.inject({
      method: "PATCH",
      url: `/folders/${c}/order`,
      payload: { before: a },
    });
    assert.equal(moved.statusCode, 200, moved.body);
    assert.deepEqual(await currentOrder(), [c, a, b]);

    const appended = await app.inject({
      method: "PATCH",
      url: `/folders/${a}/order`,
      payload: { before: null },
    });
    assert.equal(appended.statusCode, 200, appended.body);
    assert.deepEqual(await currentOrder(), [c, b, a]);

    const invalid = await app.inject({
      method: "PATCH",
      url: `/folders/${b}/order`,
      payload: { before: randomUUID() },
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.deepEqual(await currentOrder(), [c, b, a]);

    const [viewer] = await database("asmblyr_users")
      .withSchema("public")
      .insert({ email: `${randomUUID()}@example.test`, superuser: false })
      .returning<{ id: string }[]>("id");
    viewerId = viewer.id;
    const viewerToken = (await issueUserTokens(database, viewerId)).accessToken;
    const forbidden = await app.inject({
      method: "PATCH",
      url: `/folders/${b}/order`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { before: c },
    });
    assert.equal(forbidden.statusCode, 403, forbidden.body);
    assert.deepEqual(await currentOrder(), [c, b, a]);

    const listed = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(
      listed
        .json()
        .data.find((entry: { name: string }) => entry.name === collectionName)
        .folderId,
      b,
    );
  } finally {
    await database.schema
      .withSchema("public")
      .dropTableIfExists(collectionName);
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ name: collectionName })
      .delete();
    await database("asmblyr_collection_folders")
      .withSchema("public")
      .whereIn("id", ids)
      .delete();
    if (viewerId)
      await database("asmblyr_users")
        .withSchema("public")
        .where({ id: viewerId })
        .delete();
    await app.close();
    await database.destroy();
  }
});
