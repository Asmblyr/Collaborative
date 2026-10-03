exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_settings", (table) => {
    table.string("key", 64).primary();
    table.jsonb("value").notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("jsonb_typeof(value) = 'object'");
  });
};

exports.down = async (knex) => {
  if (await knex("asmblyr_settings").withSchema("public").first("key")) {
    throw new Error("Cannot discard saved system settings");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_settings");
};
