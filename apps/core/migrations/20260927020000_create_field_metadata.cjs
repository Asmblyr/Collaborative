exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_field_metadata", (table) => {
    table.string("collection_name", 63).notNullable()
      .references("name").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("field_name", 63).notNullable();
    table.string("semantic_type", 32).notNullable();
    table.primary(["collection_name", "field_name"]);
    table.check("semantic_type = 'email'");
  });
};

exports.down = async (knex) => {
  await knex.raw('LOCK TABLE public.asmblyr_field_metadata IN ACCESS EXCLUSIVE MODE');
  const [{ count }] = await knex("asmblyr_field_metadata").withSchema("public")
    .count("* as count");
  if (Number(count) > 0) {
    throw new Error("Cannot roll back field metadata while semantic fields exist");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_field_metadata");
};
