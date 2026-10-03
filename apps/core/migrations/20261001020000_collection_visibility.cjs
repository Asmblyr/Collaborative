exports.up = async function (knex) {
  await knex.schema.withSchema('public').alterTable('asmblyr_collections', (table) => {
    table.boolean('hidden').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  const configured = await knex('asmblyr_collections').withSchema('public').where({ hidden: true }).first('id');
  if (configured) throw new Error('Cannot discard configured collection visibility');
  await knex.schema.withSchema('public').alterTable('asmblyr_collections', (table) => {
    table.dropColumn('hidden');
  });
};
