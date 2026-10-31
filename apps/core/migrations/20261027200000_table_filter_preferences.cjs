exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_table_preferences", (table) => {
    // SQL NULL means never saved; JSON null records an explicit filter reset.
    table.jsonb("filter");
  });
};

exports.down = async (knex) => {
  const saved = await knex("public.asmblyr_table_preferences")
    .whereNotNull("filter")
    .first("user_id");
  if (saved) {
    throw new Error("Cannot discard saved personal table filters");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_table_preferences", (table) => {
    table.dropColumn("filter");
  });
};
