exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_profile_display", (table) => {
      table.integer("id").primary();
      table.text("title").notNullable().defaultTo("");
      table.jsonb("entries").notNullable().defaultTo("[]");
    });
  await knex("public.asmblyr_profile_display").insert({ id: 1 });
};

exports.down = async (knex) => {
  await knex.schema.withSchema("public").dropTable("asmblyr_profile_display");
};
