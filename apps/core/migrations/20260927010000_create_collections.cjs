exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_collections", (table) => {
    table.string("name", 63).primary();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async (knex) => {
  await knex.raw('LOCK TABLE public.asmblyr_collections IN ACCESS EXCLUSIVE MODE');
  const [{ count }] = await knex("asmblyr_collections").withSchema("public")
    .count("* as count");
  if (Number(count) > 0) {
    throw new Error("Cannot roll back collections metadata while collections exist");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_collections");
};
