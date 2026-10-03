exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_user_identities", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("public.asmblyr_users")
      .onDelete("CASCADE");
    table.string("provider", 48).notNullable();
    table.text("issuer").notNullable();
    table.string("subject", 512).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["provider", "issuer", "subject"], {
      indexName: "asmblyr_identity_external_unique",
    });
    table.unique(["user_id", "provider"], { indexName: "asmblyr_identity_user_provider_unique" });
  });
  await knex.schema.withSchema("public").createTable("asmblyr_auth_flows", (table) => {
    table.string("state_hash", 64).primary();
    table.string("browser_hash", 64).notNullable();
    table.string("config_hash", 64).notNullable();
    table.string("provider", 48).notNullable();
    table.string("code_verifier", 128).notNullable();
    table.string("nonce", 128).notNullable();
    table.uuid("user_id").references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table
      .uuid("session_id")
      .references("id")
      .inTable("public.asmblyr_auth_sessions")
      .onDelete("CASCADE");
    table.text("return_to").notNullable();
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
    table.check("(user_id IS NULL) = (session_id IS NULL)");
  });
};

exports.down = async (knex) => {
  if (await knex("public.asmblyr_user_identities").first("id")) {
    throw new Error("Cannot discard linked sign-in identities");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_auth_flows");
  await knex.schema.withSchema("public").dropTable("asmblyr_user_identities");
};
