exports.up = async function(knex) {
  await knex.schema.withSchema('public').createTable('asmblyr_table_views', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('public.asmblyr_users').onDelete('CASCADE');
    table.uuid('collection_id').notNullable().references('id').inTable('public.asmblyr_collections').onDelete('CASCADE');
    table.string('name', 60).notNullable();
    table.jsonb('definition').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'collection_id', 'name']);
    table.index('collection_id');
  });
  await knex.schema.withSchema('public').createTable('asmblyr_workspaces', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 120).notNullable().unique();
    table.string('description', 500).notNullable().defaultTo('');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.withSchema('public').createTable('asmblyr_workspace_collections', (table) => {
    table.uuid('workspace_id').notNullable().references('id').inTable('public.asmblyr_workspaces').onDelete('CASCADE');
    table.uuid('collection_id').notNullable().references('id').inTable('public.asmblyr_collections').onDelete('CASCADE');
    table.primary(['workspace_id', 'collection_id']);
    table.index('collection_id');
  });
  await knex.schema.withSchema('public').createTable('asmblyr_user_workspace', (table) => {
    table.uuid('user_id').primary().references('id').inTable('public.asmblyr_users').onDelete('CASCADE');
    table.uuid('workspace_id').nullable().references('id').inTable('public.asmblyr_workspaces').onDelete('SET NULL');
    table.index('workspace_id');
  });
};

exports.down = async function(knex) {
  for (const name of ['asmblyr_table_views', 'asmblyr_workspaces']) {
    if (await knex(name).withSchema('public').first()) throw new Error('Refusing rollback: saved views or workspaces exist');
  }
  for (const name of ['asmblyr_user_workspace', 'asmblyr_workspace_collections', 'asmblyr_workspaces', 'asmblyr_table_views']) {
    await knex.schema.withSchema('public').dropTable(name);
  }
};
