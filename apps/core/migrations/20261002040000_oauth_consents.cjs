exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_oauth_consents", (table) => {
    table.uuid("id").primary();
    table
      .uuid("app_id")
      .notNullable()
      .references("id")
      .inTable("public.asmblyr_oauth_apps")
      .onDelete("CASCADE");
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("public.asmblyr_users")
      .onDelete("CASCADE");
    table.text("audience").notNullable();
    table.jsonb("scopes").notNullable();
    table.timestamp("approved_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("last_used_at", { useTz: true });
    table.unique(["app_id", "user_id"]);
    table.index("user_id");
  });
  // Short-lived grant bindings keep a revoked consent from being resurrected by an in-flight flow.
  await knex.schema.withSchema("public").createTable("asmblyr_oauth_grants", (table) => {
    table.string("grant_hash", 64).primary();
    table
      .uuid("consent_id")
      .notNullable()
      .references("id")
      .inTable("public.asmblyr_oauth_consents")
      .onDelete("CASCADE")
      .index();
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
  });
};

exports.down = async (knex) => {
  if (await knex("public.asmblyr_oauth_consents").first("id")) {
    throw new Error("Cannot discard saved OAuth consents");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_oauth_grants");
  await knex.schema.withSchema("public").dropTable("asmblyr_oauth_consents");
};
