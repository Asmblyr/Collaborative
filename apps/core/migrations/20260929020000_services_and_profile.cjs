exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_users", (table) => {
    table.string("display_name", 120);
  });
  await knex.schema.withSchema("public").createTable("asmblyr_service_accounts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 120).notNullable();
    table.string("description", 500).notNullable().defaultTo("");
    table.string("status", 16).notNullable().defaultTo("active");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("status IN ('active', 'disabled')");
  });
  await knex.schema.withSchema("public").createTable("asmblyr_service_policies", (table) => {
    table.uuid("service_id").notNullable().references("id")
      .inTable("public.asmblyr_service_accounts").onDelete("CASCADE");
    table.uuid("policy_id").notNullable().references("id")
      .inTable("public.asmblyr_policies").onDelete("CASCADE");
    table.primary(["service_id", "policy_id"]);
    table.index("policy_id");
  });
  await knex.schema.withSchema("public").createTable("asmblyr_service_keys", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("service_id").notNullable().references("id")
      .inTable("public.asmblyr_service_accounts").onDelete("CASCADE").index();
    table.string("name", 120).notNullable();
    table.string("prefix", 20).notNullable();
    table.string("key_hash", 64).notNullable().unique();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("last_used_at", { useTz: true });
    table.timestamp("revoked_at", { useTz: true });
  });
  await knex.schema.withSchema("public").createTable("asmblyr_service_tokens", (table) => {
    table.string("token_hash", 64).primary();
    table.uuid("key_id").notNullable().references("id")
      .inTable("public.asmblyr_service_keys").onDelete("CASCADE").index();
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
  });
  await knex.schema.withSchema("public").createTable("asmblyr_security_events", (table) => {
    table.bigIncrements("id");
    // Historical actor/subject identifiers intentionally survive account removal.
    table.uuid("actor_id").notNullable();
    table.string("action", 60).notNullable();
    table.uuid("subject_id").notNullable();
    table.jsonb("details").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now()).index();
    table.index(["subject_id", "id"]);
  });
};

exports.down = async (knex) => {
  for (const name of ["asmblyr_service_accounts", "asmblyr_security_events"]) {
    const row = await knex(name).withSchema("public").first("id");
    if (row) throw new Error("Cannot roll back while service accounts or security history exist");
  }
  const profile = await knex("asmblyr_users").withSchema("public").whereNotNull("display_name").first("id");
  if (profile) throw new Error("Cannot roll back while profile names exist");
  for (const name of ["asmblyr_security_events", "asmblyr_service_tokens", "asmblyr_service_keys",
    "asmblyr_service_policies", "asmblyr_service_accounts"]) {
    await knex.schema.withSchema("public").dropTable(name);
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_users", (table) => table.dropColumn("display_name"));
};
