exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.string("display_field", 63).nullable();
  });
};

exports.down = async (knex) => {
  const configured = await knex("asmblyr_collections").withSchema("public")
    .whereNotNull("display_field").first("name");
  if (configured) throw new Error("Reset collection display fields before rolling back");
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.dropColumn("display_field");
  });
};
