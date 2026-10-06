exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_system_fields", (table) => {
      table.string("collection_name", 63).notNullable();
      table.string("field_name", 63).notNullable();
      table.jsonb("definition").notNullable();
      table.jsonb("presentation").notNullable().defaultTo("{}");
      table
        .timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.primary(["collection_name", "field_name"]);
    });
};

exports.down = async (knex) => {
  if (await knex("public.asmblyr_system_fields").first("field_name")) {
    throw new Error(
      "Remove custom system fields explicitly before rolling back their ownership registry",
    );
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_system_fields");
};
