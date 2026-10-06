exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_assistant_cancellations", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.boolean("cancel_requested").notNullable().defaultTo(false);
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
  });
  await knex.schema.withSchema("public").createTable("asmblyr_action_drafts", (table) => {
    table.uuid("id").primary();
    table.text("owner").notNullable().index();
    table.text("namespace").notNullable();
    table.jsonb("value").notNullable();
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
  });
};
exports.down = async function (knex) {
  await knex.schema.withSchema("public").dropTable("asmblyr_action_drafts");
  await knex.schema.withSchema("public").dropTable("asmblyr_assistant_cancellations");
};
