import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import knex, { type Knex } from "knex";

const migration = createRequire(import.meta.url)(
  "../migrations/20261003030000_settings_read_permissions.cjs",
) as {
  up(db: Knex): Promise<void>;
  down(db: Knex): Promise<void>;
};

test("settings migration preserves existing writers and refuses to discard read-only grants", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const tx = await db.transaction();
  try {
    // This historical migration predates the files section. Its rollback fixture
    // excludes newer grants inside the disposable transaction only.
    await tx("public.asmblyr_permissions").where({ section: "files" }).delete();
    // Exercise the old schema and upgrade inside a disposable transaction.
    await tx("public.asmblyr_permissions")
      .whereNotNull("section")
      .where({ action: "read" })
      .delete();
    await migration.down(tx);
    await tx("public.asmblyr_permissions")
      .insert({ section: "plugins", action: "update", fields: ["*"] })
      .onConflict()
      .ignore();
    const before = await tx("public.asmblyr_permissions")
      .whereNotNull("section")
      .select("id", "section", "action", "fields")
      .orderBy("id");
    await migration.up(tx);
    const after = await tx("public.asmblyr_permissions")
      .whereNotNull("section")
      .select("id", "section", "action", "fields")
      .orderBy("id");
    assert.deepEqual(after, before);
    const [reader] = await tx("public.asmblyr_permissions")
      .insert({ section: "plugins", action: "read", fields: ["*"] })
      .returning("id");
    await assert.rejects(
      migration.down(tx),
      /read-only settings permissions exist/,
    );
    assert.ok(
      await tx("public.asmblyr_permissions")
        .where({ id: reader.id, action: "read" })
        .first("id"),
    );
    assert.equal(
      (await tx("public.asmblyr_permissions").where({ section: "plugins" }))
        .length,
      2,
    );
    await tx("public.asmblyr_permissions").where({ id: reader.id }).delete();
    await migration.down(tx);
    await migration.up(tx);
    assert.deepEqual(
      await tx("public.asmblyr_permissions")
        .whereNotNull("section")
        .select("id", "section", "action", "fields")
        .orderBy("id"),
      before,
    );
  } finally {
    await tx.rollback();
    await db.destroy();
  }
});
