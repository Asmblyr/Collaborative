exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_plugin_delegations", (table) => {
    table.string("token_hash", 64).primary();
    table.string("plugin_name", 214).notNullable();
    table.uuid("session_id").notNullable().references("id").inTable("public.asmblyr_auth_sessions").onDelete("CASCADE");
    table.jsonb("routes").notNullable();
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_plugin_delegations IN ACCESS EXCLUSIVE MODE");
  const active = await knex("public.asmblyr_plugin_delegations")
    .where("expires_at", ">", knex.fn.now()).first();
  if (active) {
    throw new Error("Cannot remove active plugin delegations");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_plugin_delegations");
};
