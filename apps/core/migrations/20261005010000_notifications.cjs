exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_notification_subscriptions", (table) => {
    table.uuid("user_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.string("source", 63).notNullable();
    table.uuid("collection_id").notNullable().references("id").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("item", 255).notNullable();
    table.boolean("enabled").notNullable().defaultTo(true);
    table.primary(["user_id", "source", "collection_id", "item"]);
    table.index(["source", "collection_id", "item", "enabled"]);
  });
  await knex.schema.withSchema("public").createTable("asmblyr_notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.string("source", 63).notNullable();
    table.string("event_id", 128).notNullable();
    table.string("panel_id", 64).notNullable();
    table.string("target_id", 128).notNullable();
    table.uuid("collection_id").notNullable().references("id").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("item", 255).notNullable();
    table.string("actor_name", 128).nullable();
    table.string("preview", 300).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("read_at", { useTz: true }).nullable();
    table.unique(["user_id", "source", "event_id"]);
    table.index(["user_id", "created_at", "id"]);
    table.index(["collection_id", "item"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.withSchema("public").dropTable("asmblyr_notifications");
  await knex.schema.withSchema("public").dropTable("asmblyr_notification_subscriptions");
};
