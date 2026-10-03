exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_field_metadata", (table) => {
    table.boolean("required").notNullable().defaultTo(false);
  });
  await knex.raw(
    "ALTER TABLE public.asmblyr_field_metadata ALTER COLUMN semantic_type DROP NOT NULL",
  );
  await knex.raw(`
    INSERT INTO public.asmblyr_field_metadata
      (collection_name, field_name, semantic_type, required)
    SELECT m.name, c.column_name, NULL, TRUE
    FROM public.asmblyr_collections AS m
    JOIN information_schema.columns AS c
      ON c.table_schema = 'public'
      AND c.table_name = m.name
      AND c.column_name <> 'id'
    WHERE c.is_nullable = 'NO'
    ON CONFLICT (collection_name, field_name)
      DO UPDATE SET required = EXCLUDED.required
  `);
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_field_metadata IN ACCESS EXCLUSIVE MODE");
  const result = await knex.raw(`
    SELECT
      EXISTS (
        SELECT 1
        FROM public.asmblyr_collections AS m
        JOIN information_schema.columns AS c
          ON c.table_schema = 'public'
          AND c.table_name = m.name
          AND c.column_name <> 'id'
        LEFT JOIN public.asmblyr_field_metadata AS fm
          ON fm.collection_name = m.name
          AND fm.field_name = c.column_name
        WHERE COALESCE(fm.required, FALSE) <> (c.is_nullable = 'NO')
      ) AS changed_rules,
      EXISTS (
        SELECT 1
        FROM public.asmblyr_field_metadata AS fm
        LEFT JOIN information_schema.columns AS c
          ON c.table_schema = 'public'
          AND c.table_name = fm.collection_name
          AND c.column_name = fm.field_name
        WHERE c.column_name IS NULL
      ) AS stale_metadata
  `);
  if (result.rows[0].changed_rules || result.rows[0].stale_metadata) {
    throw new Error("Cannot roll back independent required rules without changing field behavior");
  }
  await knex("asmblyr_field_metadata").withSchema("public")
    .whereNull("semantic_type").delete();
  await knex.raw(
    "ALTER TABLE public.asmblyr_field_metadata ALTER COLUMN semantic_type SET NOT NULL",
  );
  await knex.schema.withSchema("public").alterTable("asmblyr_field_metadata", (table) => {
    table.dropColumn("required");
  });
};
