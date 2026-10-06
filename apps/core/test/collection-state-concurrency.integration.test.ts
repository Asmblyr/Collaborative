import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { defaultCollectionState } from "@asmblyr-collaborative/contracts";
import { createCollection } from "../src/collections/service.js";
import { saveCollectionState } from "../src/collections/state-settings.js";
import { deleteCollectionField } from "../src/collections/lifecycle-service.js";
import { updateFieldDefinition } from "../src/collections/field-update-service.js";
import { updateFieldPresentation } from "../src/collections/field-presentation.js";
import { saveFieldConfiguration } from "../src/collections/field-configuration.js";

test("field mutations recheck protection after waiting for system state adoption", async () => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const mutations = [
    {
      statusCode: 403,
      run: (name: string) => deleteCollectionField(db, name, "status"),
    },
    {
      statusCode: 400,
      run: (name: string) =>
        updateFieldDefinition(db, name, "status", { required: false }),
    },
    {
      statusCode: 400,
      run: (name: string) =>
        updateFieldPresentation(db, name, "status", { interface: "input" }),
    },
    {
      statusCode: 400,
      run: (name: string) =>
        saveFieldConfiguration(db, name, "status", { searchable: true }),
    },
  ];
  try {
    for (const [index, mutation] of mutations.entries()) {
      const name = `test_state_race_${suffix}_${index}`;
      await createCollection(db, {
        name,
        fields: [{ name: "status", type: "text" }],
      });
      const transaction = await db.transaction();
      try {
        await saveCollectionState(transaction, name, defaultCollectionState());
        const lockSubmitted = new Promise<void>((resolve) => {
          const listener = (query: { sql: string; bindings?: unknown[] }) => {
            if (
              query.sql.startsWith("LOCK TABLE") &&
              query.sql.includes(name)
            ) {
              db.removeListener("query", listener);
              resolve();
            }
          };
          db.on("query", listener);
        });
        const rejected = assert.rejects(mutation.run(name), {
          statusCode: mutation.statusCode,
        });
        await lockSubmitted;
        await transaction.commit();
        await rejected;
        assert.equal(await db.schema.hasColumn(name, "status"), true);
        const field = await db("asmblyr_field_metadata")
          .where({ collection_name: name, field_name: "status" })
          .first();
        assert.equal(field.required, true);
        assert.equal(field.presentation.interface, "select");
      } finally {
        if (!transaction.isCompleted()) await transaction.rollback();
        await db.schema.dropTableIfExists(name);
        await db("asmblyr_collections").where({ name }).delete();
      }
    }
  } finally {
    await db.destroy();
  }
});
