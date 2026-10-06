exports.up = async function (knex) {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_collections", (t) => {
      t.string("source_kind", 32).notNullable().defaultTo("table");
      t.string("source_schema_hash", 64);
    });
  await knex.raw(`ALTER TABLE public.asmblyr_collections ADD CONSTRAINT asmblyr_collection_source_check
    CHECK (source_kind IN ('table', 'materialized-view'))`);
  // Keep PostgreSQL's existing table introspection unchanged; add registered MVs.
  await knex.raw(`CREATE VIEW public.asmblyr_columns AS
    SELECT table_schema::text, table_name::text, column_name::text, data_type::text,
      is_nullable::text, character_maximum_length::integer, ordinal_position::integer
    FROM information_schema.columns
    UNION ALL
    SELECT n.nspname::text, c.relname::text, a.attname::text,
      pg_catalog.format_type(a.atttypid, NULL)::text,
      CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END::text,
      CASE WHEN a.atttypid IN (1042, 1043) AND a.atttypmod >= 4 THEN a.atttypmod - 4 ELSE NULL END::integer,
      a.attnum::integer
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'm' AND a.attnum > 0 AND NOT a.attisdropped
      AND EXISTS (SELECT 1 FROM public.asmblyr_collections m
        WHERE m.name = c.relname AND m.source_kind = 'materialized-view')`);
};

exports.down = async function (knex) {
  const active = await knex("asmblyr_collections")
    .withSchema("public")
    .where({ source_kind: "materialized-view" })
    .first("id");
  if (active) {
    throw new Error("Disconnect materialized collections before rollback");
  }
  await knex.raw("DROP VIEW public.asmblyr_columns");
  await knex.raw(
    "ALTER TABLE public.asmblyr_collections DROP CONSTRAINT asmblyr_collection_source_check",
  );
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_collections", (t) => {
      t.dropColumn("source_schema_hash");
      t.dropColumn("source_kind");
    });
};
