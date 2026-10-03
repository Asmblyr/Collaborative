exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_relations", (table) => {
    table.string("source_collection", 63).notNullable()
      .references("name").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("source_field", 63).notNullable();
    table.string("target_collection", 63).notNullable()
      .references("name").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.primary(["source_collection", "source_field"]);
    table.index("target_collection", "asmblyr_relations_target_idx");
  });
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_relations IN ACCESS EXCLUSIVE MODE");
  const [{ count }] = await knex("asmblyr_relations").withSchema("public").count("* as count");
  if (Number(count) > 0) throw new Error("Cannot roll back while collection relations exist");
  await knex.schema.withSchema("public").dropTable("asmblyr_relations");
};
