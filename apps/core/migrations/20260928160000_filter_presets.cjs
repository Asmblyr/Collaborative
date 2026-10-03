exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_filter_presets", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").notNullable()
      .references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.uuid("collection_id").notNullable()
      .references("id").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("name", 60).notNullable();
    table.jsonb("filter").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["user_id", "collection_id", "updated_at"], "asmblyr_filter_presets_list_idx");
    table.check("length(trim(name)) > 0");
    table.check("jsonb_typeof(filter) = 'object'");
  });
  await knex.raw(`CREATE UNIQUE INDEX asmblyr_filter_presets_owner_name_idx
    ON public.asmblyr_filter_presets (user_id, collection_id, lower(name))`);
};

exports.down = async (knex) => {
  const row = await knex("asmblyr_filter_presets").withSchema("public").first("id");
  if (row) throw new Error("Cannot roll back saved filters while presets exist");
  await knex.schema.withSchema("public").dropTable("asmblyr_filter_presets");
};
