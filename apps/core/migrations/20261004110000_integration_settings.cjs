exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_integration_settings", (table) => {
    table.integer("id").primary();
    table.uuid("revision").notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("binding").notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    table.jsonb("values").notNullable().defaultTo("{}");
    table.jsonb("secrets").notNullable().defaultTo("{}");
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("id = 1");
  });
  await knex("asmblyr_integration_settings").withSchema("public").insert({ id: 1 });
};

exports.down = async function (knex) {
  const row = await knex("asmblyr_integration_settings").withSchema("public").first();
  if (row && (Object.keys(row.values).length || Object.keys(row.secrets).length)) {
    throw new Error("Export integration settings and secrets before rolling back this migration");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_integration_settings");
};
