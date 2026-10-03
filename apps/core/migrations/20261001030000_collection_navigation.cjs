exports.up = async (knex) => {
  await knex.schema.withSchema('public').alterTable('asmblyr_collections', (table) => {
    table.string('parent_collection', 63).nullable()
      .references('name').inTable('public.asmblyr_collections').onDelete('SET NULL');
    table.index('parent_collection', 'asmblyr_collections_parent_idx');
  });
  await knex.raw(`ALTER TABLE public.asmblyr_collections
    ADD CONSTRAINT asmblyr_collections_navigation_parent_check
    CHECK (parent_collection IS NULL OR (folder_id IS NULL AND parent_collection <> name))`);
};

exports.down = async (knex) => {
  await knex.raw('LOCK TABLE public.asmblyr_collections IN ACCESS EXCLUSIVE MODE');
  const configured = await knex('asmblyr_collections').withSchema('public')
    .whereNotNull('parent_collection').first('name');
  if (configured) throw new Error('Cannot discard configured collection nesting');
  await knex.schema.withSchema('public').alterTable('asmblyr_collections', (table) => {
    table.dropColumn('parent_collection');
  });
};
