exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_cli_grants", (t) => {
    t.string("code_hash", 64).primary();
    t.uuid("session_id").notNullable().references("id").inTable("public.asmblyr_auth_sessions").onDelete("CASCADE");
    t.string("challenge", 43).notNullable();
    t.text("redirect_uri").notNullable();
    t.timestamp("code_expires_at", { useTz: true }).notNullable();
    t.timestamp("consumed_at", { useTz: true });
    t.string("token_hash", 64).unique();
    t.timestamp("expires_at", { useTz: true }).notNullable().index();
  });
};
exports.down = async function (knex) {
  // Only short-lived CLI grants are removed. User sessions and business data remain.
  await knex.schema.withSchema("public").dropTable("asmblyr_cli_grants");
};
