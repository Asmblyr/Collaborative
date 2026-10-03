exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.uuid("id").notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    table.unique("id");
  });

  await knex.schema.withSchema("public").createTable("asmblyr_item_events", (table) => {
    table.bigIncrements("id");
    // No foreign key: history must survive deletion and recreation of a collection name.
    table.uuid("collection_id").notNullable();
    table.string("collection_name", 63).notNullable();
    table.string("item_id", 255).notNullable();
    table.string("action", 10).notNullable();
    table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.string("actor_kind", 20).notNullable();
    table.string("actor_id", 255);
    table.uuid("request_id").notNullable();
    table.jsonb("before");
    table.jsonb("after");
    table.index(["collection_id", "id"], "asmblyr_item_events_collection_idx");
    table.index(["collection_id", "item_id", "id"], "asmblyr_item_events_record_idx");
  });

  await knex.raw(`
    ALTER TABLE public.asmblyr_item_events
      ADD CONSTRAINT asmblyr_item_events_shape CHECK (
        (action = 'create' AND "before" IS NULL AND "after" IS NOT NULL) OR
        (action = 'update' AND "before" IS NOT NULL AND "after" IS NOT NULL) OR
        (action = 'delete' AND "before" IS NOT NULL AND "after" IS NULL)
      ),
      ADD CONSTRAINT asmblyr_item_events_actor CHECK (
        (actor_kind = 'anonymous' AND actor_id IS NULL) OR
        (actor_kind IN ('user', 'service') AND actor_id IS NOT NULL)
      )
  `);
};

exports.down = async (knex) => {
  const [{ count }] = await knex("asmblyr_item_events").withSchema("public")
    .count("* as count");
  if (Number(count) > 0) {
    throw new Error("Cannot roll back item history while events exist");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_item_events");
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.dropColumn("id");
  });
};
