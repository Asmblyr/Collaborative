exports.up = async function (knex) {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_field_metadata", (table) => {
      table.text("search_priority").nullable();
    });
  await knex.raw(`ALTER TABLE public.asmblyr_field_metadata
    ADD CONSTRAINT asmblyr_field_search_priority_check
    CHECK (search_priority IN ('primary', 'secondary'))`);
};

exports.down = async function (knex) {
  await knex.raw(
    "LOCK TABLE public.asmblyr_field_metadata IN ACCESS EXCLUSIVE MODE",
  );
  const configured = await knex("asmblyr_field_metadata")
    .withSchema("public")
    .whereNotNull("search_priority")
    .first("field_name");
  if (configured) {
    throw new Error("Cannot roll back configured search priorities");
  }
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_field_metadata", (table) => {
      table.dropColumn("search_priority");
    });
};
