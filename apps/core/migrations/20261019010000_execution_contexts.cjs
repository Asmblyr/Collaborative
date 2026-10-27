exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_execution_contexts", (table) => {
    table.string("token_hash", 64).primary();
    table.string("plugin_name", 214).notNullable();
    table.string("purpose", 16).notNullable();
    table.jsonb("payload").notNullable();
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.withSchema("public").createTable("asmblyr_plugin_task_accounts", (table) => {
    table.string("plugin_name", 214).primary();
    table.uuid("service_id").notNullable().unique().references("id").inTable("public.asmblyr_service_accounts");
  });
};

exports.down = async (knex) => {
  await knex.raw('LOCK TABLE public.asmblyr_execution_contexts IN ACCESS EXCLUSIVE MODE');
  const row = await knex("public.asmblyr_execution_contexts").where("expires_at", ">", knex.fn.now()).first();
  if (row) throw new Error("Cannot remove active execution contexts or queued event origins");
  const task = await knex("public.asmblyr_plugin_task_accounts").first();
  if (task) throw new Error("Cannot remove registered background task identities");
  await knex.schema.withSchema("public").dropTable("asmblyr_plugin_task_accounts");
  await knex.schema.withSchema("public").dropTable("asmblyr_execution_contexts");
};
