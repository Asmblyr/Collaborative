import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex, { type Knex } from "knex";

const migration = createRequire(import.meta.url)(
  "../migrations/20261003040000_policy_delegations.cjs",
) as { up(db: Knex): Promise<void>; down(db: Knex): Promise<void> };

test("delegation migration never broadens existing grants and refuses destructive rollback", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const tx = await db.transaction();
  try {
    await tx("public.asmblyr_user_policy_delegations").delete();
    await migration.down(tx);
    const before = await tx("public.asmblyr_policy_permissions")
      .select("*")
      .orderBy("policy_id")
      .orderBy("permission_id");
    await migration.up(tx);
    assert.deepEqual(
      await tx("public.asmblyr_policy_permissions")
        .select("*")
        .orderBy("policy_id")
        .orderBy("permission_id"),
      before,
    );
    assert.deepEqual(
      await tx("public.asmblyr_user_policy_delegations").select("*"),
      [],
    );
    const [user] = await tx("public.asmblyr_users")
      .insert({ email: `${randomUUID()}@migration.test` })
      .returning("id");
    const [policy] = await tx("public.asmblyr_policies")
      .insert({ name: randomUUID() })
      .returning("id");
    await tx("public.asmblyr_user_policy_delegations").insert({
      user_id: user.id,
      policy_id: policy.id,
    });
    await assert.rejects(migration.down(tx), /policy delegation limits exist/);
    assert.equal(
      (await tx("public.asmblyr_user_policy_delegations").select("*")).length,
      1,
    );
    await tx("public.asmblyr_policies").where({ id: policy.id }).delete();
    assert.deepEqual(
      await tx("public.asmblyr_user_policy_delegations").select("*"),
      [],
    );
    await migration.down(tx);
    await migration.up(tx);
  } finally {
    await tx.rollback();
    await db.destroy();
  }
});
