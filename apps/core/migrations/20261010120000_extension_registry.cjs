exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_extension_states", (table) => {
    table.text("package_name").primary();
    table.boolean("enabled").notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.withSchema("public").createTable("asmblyr_extension_history", (table) => {
    table.bigIncrements("id").primary();
    table.text("package_name").notNullable();
    table.string("action", 24).notNullable();
    table.string("result", 32).notNullable();
    table.string("error_code", 80).nullable();
    table.text("error_message").nullable();
    table.uuid("actor_id").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["package_name", "id"]);
  });
};

exports.down = async function (knex) {
  if (await knex("asmblyr_extension_history").withSchema("public").first("id")) {
    throw new Error("Cannot discard extension operation history; restore a backup instead");
  }
  if (await knex("asmblyr_extension_states").withSchema("public").first("package_name")) {
    throw new Error("Cannot discard extension activation states; restore a backup instead");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_extension_history");
  await knex.schema.withSchema("public").dropTable("asmblyr_extension_states");
};
