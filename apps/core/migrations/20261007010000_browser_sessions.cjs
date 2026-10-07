exports.up = async function (knex) {
  await knex.schema.withSchema('public').alterTable('asmblyr_auth_sessions', (table) => {
    table.string('browser_hash', 64).unique();
  });
};

exports.down = async function (knex) {
  await knex.schema.withSchema('public').alterTable('asmblyr_auth_sessions', (table) => {
    table.dropColumn('browser_hash');
  });
};
