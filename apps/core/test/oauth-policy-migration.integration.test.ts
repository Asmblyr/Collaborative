import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { Knex } from "knex";
import { oauthFixture } from "./support/oauth-provider.js";

const migration = createRequire(import.meta.url)(
  "../migrations/20261007030000_oauth_policy_access.cjs",
) as { up(db: Knex): Promise<void>; down(db: Knex): Promise<void> };

test("application-policy migration preserves legacy access and refuses loss of configuration", async () => {
  const f = await oauthFixture();
  try {
    await f.db.transaction(async (trx) => {
      await migration.down(trx);
      await migration.up(trx);
      const row = await trx("public.asmblyr_oauth_apps")
        .where({ id: f.application.id })
        .first();
      assert.equal(row.policy_managed, false);
      assert.equal(row.access_mode, "selected");
      assert.deepEqual(row.scopes, f.input.scopes);
      assert.deepEqual(row.scope_labels, {});
      assert.deepEqual(await trx("public.asmblyr_policy_oauth_apps"), []);
    });
    await f
      .db("public.asmblyr_oauth_apps")
      .where({ id: f.application.id })
      .update({ policy_managed: true });
    await assert.rejects(
      f.db.transaction((trx) => migration.down(trx)),
      /Cannot discard configured application policies/,
    );
    await f
      .db("public.asmblyr_oauth_apps")
      .where({ id: f.application.id })
      .update({
        policy_managed: false,
        scope_labels: JSON.stringify({ [f.input.scopes[0]]: "Monitoring" }),
      });
    await assert.rejects(
      f.db.transaction((trx) => migration.down(trx)),
      /Cannot discard configured application policies/,
    );
  } finally {
    await f.close();
  }
});
