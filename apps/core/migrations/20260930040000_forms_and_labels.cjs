exports.up = async function (knex) {
  await knex.schema.withSchema('public').alterTable('asmblyr_collections', (table) => {
    table.jsonb('form_layout').nullable();
    table.text('display_template').nullable();
  });
};

exports.down = async function (knex) {
  // Only presentation metadata is lost. User tables and records are untouched.
  await knex.schema.withSchema('public').alterTable('asmblyr_collections', (table) => {
    table.dropColumn('form_layout');
    table.dropColumn('display_template');
  });
};
