exports.up = async (knex) => {
  const constraints = await knex.raw(`SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.asmblyr_field_metadata'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%semantic_type%'`);
  for (const { conname } of constraints.rows) {
    await knex.raw('ALTER TABLE public.asmblyr_field_metadata DROP CONSTRAINT ??', [conname]);
  }
  await knex.raw(`ALTER TABLE public.asmblyr_field_metadata ADD CONSTRAINT asmblyr_field_semantic_check
    CHECK (semantic_type IS NULL OR semantic_type IN ('email', 'file', 'files'))`);
  await knex.schema.withSchema('public').createTable('asmblyr_file_references', (t) => {
    t.uuid('collection_id').notNullable().references('id').inTable('public.asmblyr_collections').onDelete('CASCADE');
    t.string('item_id', 255).notNullable();
    t.string('field_name', 63).notNullable();
    t.uuid('file_id').notNullable().references('id').inTable('public.asmblyr_files').onDelete('RESTRICT');
    t.primary(['collection_id', 'item_id', 'field_name', 'file_id']);
    t.index('file_id');
  });
};

exports.down = async (knex) => {
  if (await knex('asmblyr_file_references').first('file_id') ||
    await knex('asmblyr_field_metadata').whereIn('semantic_type', ['file', 'files']).first('field_name') ||
    (await knex.raw(`SELECT 1 FROM information_schema.columns c JOIN public.asmblyr_collections m
      ON m.name = c.table_name WHERE c.table_schema = 'public' AND c.data_type IN ('numeric', 'jsonb') LIMIT 1`)).rows.length ||
    await knex('asmblyr_field_metadata').whereRaw("presentation->>'interface' IN ('select', 'multiselect')").first('field_name')) {
    throw new Error('Cannot roll back while extended fields or file references exist');
  }
  await knex.schema.withSchema('public').dropTable('asmblyr_file_references');
  await knex.raw('ALTER TABLE public.asmblyr_field_metadata DROP CONSTRAINT asmblyr_field_semantic_check');
  await knex.raw("ALTER TABLE public.asmblyr_field_metadata ADD CHECK (semantic_type IS NULL OR semantic_type = 'email')");
};
