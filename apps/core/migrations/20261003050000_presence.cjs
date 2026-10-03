exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_presence", (table) => {
      table
        .uuid("session_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_auth_sessions")
        .onDelete("CASCADE");
      table.uuid("client_id").notNullable();
      table.text("scope_key").notNullable();
      table.timestamp("expires_at", { useTz: true }).notNullable();
      table.primary(["session_id", "client_id"]);
      table.index(["scope_key", "expires_at"]);
      table.index("expires_at");
    });
};
// Presence is transient: rolling back discards only current online indicators.
exports.down = async (knex) => {
  await knex.schema.withSchema("public").dropTable("asmblyr_presence");
};
