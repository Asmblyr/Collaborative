exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_plugin_migrations", (table) => {
    table
      .string("plugin_namespace", 31)
      .notNullable()
      .references("namespace")
      .inTable("public.asmblyr_plugins")
      .onDelete("RESTRICT");
    table.text("name").notNullable();
    table.string("checksum", 64).notNullable();
    table.boolean("baseline").notNullable();
    table.timestamp("applied_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.primary(["plugin_namespace", "name"]);
  });
};

exports.down = async function (knex) {
  if (await knex("asmblyr_plugin_migrations").withSchema("public").first("name"))
    throw new Error("Cannot discard applied plugin migration history; restore a backup instead");
  await knex.schema.withSchema("public").dropTable("asmblyr_plugin_migrations");
};
