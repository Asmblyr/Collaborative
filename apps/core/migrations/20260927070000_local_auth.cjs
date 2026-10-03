exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_users", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("email", 320).notNullable().unique();
    table.string("status", 16).notNullable().defaultTo("active");
    table.boolean("is_admin").notNullable().defaultTo(false);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("status IN ('active', 'disabled')");
    table.check("email = lower(email)");
  });

  await knex.schema.withSchema("public").createTable("asmblyr_password_credentials", (table) => {
    table.uuid("user_id").primary().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.text("password_hash").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema("public").createTable("asmblyr_auth_sessions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("user_id").notNullable()
      .references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("revoked_at", { useTz: true });
    table.index(["user_id", "revoked_at"], "asmblyr_auth_sessions_user_idx");
  });

  await knex.schema.withSchema("public").createTable("asmblyr_auth_tokens", (table) => {
    table.bigIncrements("id");
    table.uuid("session_id").notNullable()
      .references("id").inTable("public.asmblyr_auth_sessions").onDelete("CASCADE");
    table.string("access_hash", 64).notNullable().unique();
    table.string("refresh_hash", 64).notNullable().unique();
    table.timestamp("access_expires_at", { useTz: true }).notNullable();
    table.timestamp("refresh_expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true });
    table.index(["session_id", "consumed_at"], "asmblyr_auth_tokens_session_idx");
  });
};

exports.down = async (knex) => {
  const [{ count }] = await knex("asmblyr_users").withSchema("public").count("* as count");
  if (Number(count) > 0) {
    throw new Error("Cannot roll back authentication tables while users exist");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_auth_tokens");
  await knex.schema.withSchema("public").dropTable("asmblyr_auth_sessions");
  await knex.schema.withSchema("public").dropTable("asmblyr_password_credentials");
  await knex.schema.withSchema("public").dropTable("asmblyr_users");
};
