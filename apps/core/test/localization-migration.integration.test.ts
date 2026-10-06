import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex, { type Knex } from "knex";

const migration = createRequire(import.meta.url)(
  "../migrations/20261004100000_appearance_localization.cjs",
) as { up(db: Knex): Promise<void>; down(db: Knex): Promise<void> };

test("localization migration preserves legacy profile values and guards rollback", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const trx = await db.transaction();
  try {
    await migration.down(trx);
    const [user] = await trx("asmblyr_users")
      .insert({ email: `${randomUUID()}@example.test` })
      .returning("id");
    await trx("asmblyr_user_preferences").insert({
      user_id: user.id,
      theme: "dark",
    });
    await migration.up(trx);
    const saved = await trx("asmblyr_user_preferences")
      .where({ user_id: user.id })
      .first("theme", "style", "locale");
    assert.deepEqual(saved, { theme: "dark", style: "neutral", locale: "ru" });
    await trx("asmblyr_user_preferences")
      .where({ user_id: user.id })
      .update({ style: "coral" });
    await assert.rejects(migration.down(trx), /Refusing to discard/);
    assert.equal(
      (
        await trx("asmblyr_user_preferences")
          .where({ user_id: user.id })
          .first()
      ).style,
      "coral",
    );
    await trx("asmblyr_user_preferences")
      .where({ user_id: user.id })
      .update({ style: "neutral" });
    await migration.down(trx);
    assert.equal(
      (
        await trx("asmblyr_user_preferences")
          .where({ user_id: user.id })
          .first()
      ).theme,
      "dark",
    );
  } finally {
    await trx.rollback();
    await db.destroy();
  }
});
