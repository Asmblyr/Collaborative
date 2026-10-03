exports.up = async function (knex) {
  await knex.schema.withSchema('public').alterTable('asmblyr_collections', (table) => {
    table.string('display_name', 120).nullable();
    table.boolean('mcp_enabled').notNullable().defaultTo(true);
    table.text('mcp_description').nullable();
  });
};

exports.down = async function () {
  throw new Error('Cannot discard collection names and MCP restrictions automatically');
};
