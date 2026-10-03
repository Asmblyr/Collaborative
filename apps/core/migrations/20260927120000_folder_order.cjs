exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_collection_folders", (table) => {
    table.integer("sort_order").notNullable().defaultTo(0);
  });
  await knex.raw(`
    WITH ranked AS (
      SELECT id, (row_number() OVER (ORDER BY lower(name), id) - 1)::integer AS position
      FROM public.asmblyr_collection_folders
    )
    UPDATE public.asmblyr_collection_folders AS folder
    SET sort_order = ranked.position
    FROM ranked WHERE ranked.id = folder.id
  `);
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_collection_folders IN ACCESS EXCLUSIVE MODE");
  const result = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM (
        SELECT sort_order,
          (row_number() OVER (ORDER BY lower(name), id) - 1)::integer AS original_order
        FROM public.asmblyr_collection_folders
      ) AS ranked WHERE sort_order <> original_order
    ) AS changed
  `);
  if (result.rows[0].changed) {
    throw new Error("Cannot roll back folder order while a custom order exists");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_collection_folders", (table) => {
    table.dropColumn("sort_order");
  });
};
