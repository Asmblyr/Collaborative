exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_user_preferences", (t) => {
    t.uuid("user_id").primary().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.string("theme", 10).notNullable().defaultTo("system");
    t.check("theme IN ('light', 'dark', 'system')");
  });
  await knex.schema.withSchema("public").createTable("asmblyr_table_preferences", (t) => {
    t.uuid("user_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.uuid("collection_id").notNullable().references("id").inTable("public.asmblyr_collections").onDelete("CASCADE");
    t.primary(["user_id", "collection_id"]);
    t.index("collection_id");
    t.jsonb("columns");
    t.integer("page_size").notNullable().defaultTo(25);
    t.jsonb("sort");
  });
};
exports.down = async (knex) => {
  for (const name of ["asmblyr_table_preferences", "asmblyr_user_preferences"]) {
    if (await knex(name).first("user_id")) throw new Error("Cannot discard saved user preferences");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_table_preferences");
  await knex.schema.withSchema("public").dropTable("asmblyr_user_preferences");
};
