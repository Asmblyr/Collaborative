exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_connection_secrets", (t) => {
    t.uuid("id").primary();
    t.uuid("owner_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.jsonb("ciphertext").notNullable();
    t.timestamp("expires_at", { useTz: true });
  });
  await knex.schema.withSchema("public").createTable("asmblyr_connections", (t) => {
    t.uuid("id").primary().references("id").inTable("public.asmblyr_connection_secrets").onDelete("CASCADE");
    t.uuid("owner_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.string("provider", 32).notNullable();
    t.string("subject", 512).notNullable();
    t.string("email", 320).notNullable();
    t.string("configuration", 64).notNullable();
    t.jsonb("scopes").notNullable();
    t.string("status", 32).notNullable().defaultTo("connected");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["owner_id", "provider"]);
  });
  await knex.schema.withSchema("public").createTable("asmblyr_connection_flows", (t) => {
    t.uuid("id").primary().references("id").inTable("public.asmblyr_connection_secrets").onDelete("CASCADE");
    t.uuid("owner_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.string("state_hash", 64).notNullable().unique();
    t.string("browser_hash", 64).notNullable();
    t.string("configuration", 64).notNullable();
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("consumed_at", { useTz: true });
  });
  await knex.schema.withSchema("public").createTable("asmblyr_connection_writes", (t) => {
    t.uuid("id").primary().references("id").inTable("public.asmblyr_connection_secrets").onDelete("CASCADE");
    t.uuid("owner_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.uuid("connection_id").notNullable().references("id").inTable("public.asmblyr_connections").onDelete("CASCADE");
    t.string("status", 32).notNullable().defaultTo("pending");
    t.timestamp("expires_at", { useTz: true }).notNullable();
  });
  await knex.raw('CREATE INDEX ON public.asmblyr_connection_secrets (expires_at) WHERE expires_at IS NOT NULL');
};

exports.down = async function (knex) {
  const row = await knex("asmblyr_connection_secrets").withSchema("public").count("id as count").first();
  if (Number(row.count) > 0) { throw new Error("Cannot remove personal connection tables while credentials exist"); }
  for (const name of ["asmblyr_connection_writes", "asmblyr_connection_flows", "asmblyr_connections", "asmblyr_connection_secrets"]) {
    await knex.schema.withSchema("public").dropTable(name);
  }
};
