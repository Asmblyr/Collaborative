exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_users", (table) => {
    table.renameColumn("is_admin", "superuser");
  });
};

exports.down = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_users", (table) => {
    table.renameColumn("superuser", "is_admin");
  });
};
