exports.up = async function(knex) {
  await knex.schema.withSchema('public').alterTable('asmblyr_table_views', (table) => {
    table.uuid('user_id').nullable().alter();
    table.string('scope', 16).notNullable().defaultTo('personal');
    table.uuid('workspace_id').nullable().references('id').inTable('public.asmblyr_workspaces').onDelete('CASCADE');
    table.uuid('created_by').nullable().references('id').inTable('public.asmblyr_users').onDelete('SET NULL');
    table.boolean('is_default').notNullable().defaultTo(false);
  });
  await knex.raw('UPDATE public.asmblyr_table_views SET created_by = user_id');
  await knex.raw(`ALTER TABLE public.asmblyr_table_views ADD CONSTRAINT asmblyr_table_views_scope_check CHECK (
    (scope = 'personal' AND user_id IS NOT NULL AND workspace_id IS NULL) OR
    (scope = 'collection' AND user_id IS NULL AND workspace_id IS NULL) OR
    (scope = 'workspace' AND user_id IS NULL AND workspace_id IS NOT NULL))`);
  await knex.raw("CREATE UNIQUE INDEX asmblyr_views_collection_name ON public.asmblyr_table_views(collection_id, name) WHERE scope = 'collection'");
  await knex.raw("CREATE UNIQUE INDEX asmblyr_views_workspace_name ON public.asmblyr_table_views(workspace_id, collection_id, name) WHERE scope = 'workspace'");
  await knex.raw("CREATE UNIQUE INDEX asmblyr_views_personal_default ON public.asmblyr_table_views(user_id, collection_id) WHERE scope = 'personal' AND is_default");
  await knex.raw("CREATE UNIQUE INDEX asmblyr_views_collection_default ON public.asmblyr_table_views(collection_id) WHERE scope = 'collection' AND is_default");
  await knex.raw("CREATE UNIQUE INDEX asmblyr_views_workspace_default ON public.asmblyr_table_views(workspace_id, collection_id) WHERE scope = 'workspace' AND is_default");
};
exports.down = async function(knex) {
  if (await knex('asmblyr_table_views').withSchema('public').whereNot('scope', 'personal').orWhere('is_default', true).first()) throw new Error('Refusing rollback: shared or default views exist');
  for (const name of ['collection_name', 'workspace_name', 'personal_default', 'collection_default', 'workspace_default']) await knex.raw('DROP INDEX public.??', [`asmblyr_views_${name}`]);
  await knex.raw('ALTER TABLE public.asmblyr_table_views DROP CONSTRAINT asmblyr_table_views_scope_check');
  await knex.schema.withSchema('public').alterTable('asmblyr_table_views', (table) => {
    table.dropColumns('scope', 'workspace_id', 'created_by', 'is_default');
    table.uuid('user_id').notNullable().alter();
  });
};
