exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_collection_folders", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 120).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw("CREATE UNIQUE INDEX asmblyr_collection_folders_name_unique ON public.asmblyr_collection_folders (lower(name))");
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.uuid("folder_id").nullable()
      .references("id").inTable("public.asmblyr_collection_folders").onDelete("SET NULL");
    table.index("folder_id", "asmblyr_collections_folder_idx");
  });
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_collections IN ACCESS EXCLUSIVE MODE");
  const [{ count }] = await knex("asmblyr_collections").withSchema("public")
    .whereNotNull("folder_id").count("* as count");
  const [{ folderCount }] = await knex("asmblyr_collection_folders").withSchema("public")
    .count("* as folderCount");
  if (Number(count) > 0 || Number(folderCount) > 0) {
    throw new Error("Cannot roll back collection folders while folders or assignments exist");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.dropColumn("folder_id");
  });
  await knex.schema.withSchema("public").dropTable("asmblyr_collection_folders");
};
