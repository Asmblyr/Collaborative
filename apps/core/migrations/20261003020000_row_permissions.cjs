exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_permissions", (table) => {
      table.jsonb("row_filter");
    });
  await knex.raw(`ALTER TABLE public.asmblyr_permissions
    ADD CONSTRAINT asmblyr_permissions_row_filter_check CHECK (
      row_filter IS NULL OR (section IS NULL AND jsonb_typeof(row_filter) = 'object')
    )`);
};

exports.down = async (knex) => {
  if (
    await knex("public.asmblyr_permissions")
      .whereNotNull("row_filter")
      .first("id")
  ) {
    throw new Error(
      "Cannot roll back while row conditions exist; remove them explicitly first",
    );
  }
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_permissions", (table) => {
      table.dropColumn("row_filter");
    });
};
