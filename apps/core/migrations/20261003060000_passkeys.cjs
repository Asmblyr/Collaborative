exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_passkeys", (t) => {
      t.text("id").primary();
      t.uuid("user_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("CASCADE");
      t.binary("public_key").notNullable();
      t.bigInteger("counter").notNullable();
      t.jsonb("transports").notNullable().defaultTo("[]");
      t.string("name", 120).notNullable();
      t.timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      t.timestamp("last_used_at", { useTz: true });
      t.index("user_id");
    });
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_passkey_challenges", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.text("challenge").notNullable();
      t.string("purpose", 16).notNullable();
      t.uuid("user_id")
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("CASCADE");
      t.uuid("session_id")
        .references("id")
        .inTable("public.asmblyr_auth_sessions")
        .onDelete("CASCADE");
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
      t.check("purpose IN ('register', 'login')");
    });
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_recovery_links", (t) => {
      t.uuid("user_id")
        .primary()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("CASCADE");
      t.text("token_hash").notNullable().unique();
      t.timestamp("expires_at", { useTz: true }).notNullable();
      t.timestamp("consumed_at", { useTz: true });
    });
};
exports.down = async (knex) => {
  if (await knex("public.asmblyr_passkeys").first("id")) {
    throw new Error("Cannot remove registered passkeys");
  }
  if (
    await knex("public.asmblyr_recovery_links")
      .whereNull("consumed_at")
      .where("expires_at", ">", knex.fn.now())
      .first("user_id")
  ) {
    throw new Error("Cannot remove active recovery links");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_recovery_links");
  await knex.schema
    .withSchema("public")
    .dropTable("asmblyr_passkey_challenges");
  await knex.schema.withSchema("public").dropTable("asmblyr_passkeys");
};
