exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_plugins", (table) => {
    table.string("namespace", 31).primary();
    table.text("package_name").notNullable().unique();
    table.timestamp("installed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.withSchema("public").createTable("asmblyr_plugin_collections", (table) => {
    table
      .string("collection_name", 63)
      .primary()
      .references("name")
      .inTable("public.asmblyr_collections")
      .onDelete("RESTRICT");
    table
      .string("plugin_namespace", 31)
      .notNullable()
      .references("namespace")
      .inTable("public.asmblyr_plugins")
      .onDelete("RESTRICT");
    table.string("local_name", 63).notNullable();
    table.integer("definition_version").notNullable().defaultTo(1);
    table.jsonb("definition").notNullable();
    table.timestamp("installed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["plugin_namespace", "local_name"]);
  });
};

exports.down = async function (knex) {
  const installed = await knex("asmblyr_plugin_collections")
    .withSchema("public")
    .first("collection_name");
  if (installed)
    throw new Error("Cannot remove plugin ownership while plugin collections are installed");
  await knex.schema.withSchema("public").dropTable("asmblyr_plugin_collections");
  await knex.schema.withSchema("public").dropTable("asmblyr_plugins");
};
