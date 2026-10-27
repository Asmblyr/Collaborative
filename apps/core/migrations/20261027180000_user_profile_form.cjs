exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_user_form", (table) => {
    table.integer("id").primary();
    table.jsonb("layout").nullable();
    table.jsonb("self_access").notNullable().defaultTo("{}");
  });
  await knex("public.asmblyr_user_form").insert({ id: 1 });
};

exports.down = async (knex) => {
  const row = await knex("public.asmblyr_user_form").where({ id: 1 }).first();
  if (row?.layout || Object.keys(row?.self_access ?? {}).length) {
    throw new Error("Preserve the configured user form before rolling back");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_user_form");
};
