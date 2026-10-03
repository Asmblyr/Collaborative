exports.up = async (knex) => {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await knex.schema.withSchema("public").alterTable("asmblyr_field_metadata", (table) => {
    table.boolean("searchable").notNullable().defaultTo(true);
  });
};

exports.down = async (knex) => {
  const [{ disabled }] = await knex("asmblyr_field_metadata").withSchema("public")
    .where({ searchable: false }).count("* as disabled");
  const indexes = await knex.raw(`
    SELECT 1 FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND left(c.relname, 15) = 'asmblyr_search_'
      AND c.relkind = 'i' LIMIT 1
  `);
  if (Number(disabled) > 0 || indexes.rows.length > 0) {
    throw new Error("Cannot roll back configured field search settings or indexes");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_field_metadata", (table) => {
    table.dropColumn("searchable");
  });
  // pg_trgm is shared by the database and is intentionally retained.
};
