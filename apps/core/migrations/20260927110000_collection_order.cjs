exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.integer("sort_order").notNullable().defaultTo(0);
  });
  await knex.raw(`
    WITH ranked AS (
      SELECT name, (row_number() OVER (PARTITION BY folder_id ORDER BY name) - 1)::integer AS position
      FROM public.asmblyr_collections
    )
    UPDATE public.asmblyr_collections AS collection
    SET sort_order = ranked.position
    FROM ranked WHERE ranked.name = collection.name
  `);
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_collections IN ACCESS EXCLUSIVE MODE");
  const result = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM (
        SELECT sort_order,
          (row_number() OVER (PARTITION BY folder_id ORDER BY name) - 1)::integer AS original_order
        FROM public.asmblyr_collections
      ) AS ranked WHERE sort_order <> original_order
    ) AS changed
  `);
  if (result.rows[0].changed) {
    throw new Error("Cannot roll back collection order while a custom order exists");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.dropColumn("sort_order");
  });
};
