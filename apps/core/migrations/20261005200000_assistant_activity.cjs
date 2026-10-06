exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_assistant_messages", (table) => {
      table.jsonb("activity").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    });
};

exports.down = async (knex) => {
  const saved = await knex("public.asmblyr_assistant_messages")
    .whereRaw("activity <> '[]'::jsonb")
    .first("id");
  if (saved) {
    throw new Error("Refusing to remove saved assistant work logs.");
  }
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_assistant_messages", (table) => {
      table.dropColumn("activity");
    });
};
