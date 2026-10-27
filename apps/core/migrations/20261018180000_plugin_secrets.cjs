exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_plugin_secrets", (table) => {
    table.uuid("id").primary().references("id").inTable("public.asmblyr_connection_secrets").onDelete("CASCADE");
    table.uuid("owner_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.string("plugin_name", 214).notNullable();
    table.string("secret_key", 64).notNullable();
    table.unique(["owner_id", "plugin_name", "secret_key"]);
  });
};

exports.down = async function (knex) {
  const row = await knex("asmblyr_plugin_secrets").withSchema("public").first("id");
  if (row) {
    throw new Error("Remove plugin secrets explicitly before rolling back their metadata");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_plugin_secrets");
};
