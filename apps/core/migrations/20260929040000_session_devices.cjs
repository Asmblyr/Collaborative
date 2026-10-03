exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_auth_sessions", (t) => {
    t.string("client_label", 120).notNullable().defaultTo("Unknown client");
    t.timestamp("refreshed_at", { useTz: true });
  });
};
exports.down = async (knex) => {
  if (await knex("asmblyr_auth_sessions").whereNot("client_label", "Unknown client").first("id") ||
    await knex("asmblyr_auth_sessions").whereNotNull("refreshed_at").first("id")) {
    throw new Error("Cannot discard recorded session metadata");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_auth_sessions", (t) => t.dropColumns("client_label", "refreshed_at"));
};
