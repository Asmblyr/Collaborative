exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_field_metadata", (table) => {
    table.jsonb("default_value").nullable();
  });
  await knex.raw(`
    ALTER TABLE public.asmblyr_field_metadata
    ADD CONSTRAINT asmblyr_field_default_value_check
    CHECK (jsonb_typeof(default_value) IN ('string', 'number', 'boolean'))
  `);
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_field_metadata IN ACCESS EXCLUSIVE MODE");
  const [{ count }] = await knex("asmblyr_field_metadata").withSchema("public")
    .whereNotNull("default_value").count("* as count");
  if (Number(count) > 0) {
    throw new Error("Cannot roll back field defaults while configured defaults exist");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_field_metadata", (table) => {
    table.dropColumn("default_value");
  });
};
