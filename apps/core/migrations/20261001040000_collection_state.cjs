exports.up = async function (knex) {
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.jsonb("state").nullable();
  });
};

exports.down = async function (knex) {
  const enabled = await knex("asmblyr_collections")
    .withSchema("public")
    .whereNotNull("state")
    .first("id");
  if (enabled) throw new Error("Cannot remove state settings while a collection uses them");
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.dropColumn("state");
  });
};
