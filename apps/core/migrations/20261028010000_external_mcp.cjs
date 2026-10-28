exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_mcp_clients", (t) => {
    t.uuid("id").primary();
    t.string("name", 120).notNullable();
    t.jsonb("redirect_uris").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.withSchema("public").createTable("asmblyr_mcp_connections", (t) => {
    t.uuid("id").primary();
    t.uuid("client_id").notNullable().references("id").inTable("public.asmblyr_mcp_clients");
    t.uuid("user_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.uuid("session_id").notNullable().references("id").inTable("public.asmblyr_auth_sessions").onDelete("CASCADE");
    t.jsonb("scopes").notNullable();
    t.jsonb("collection_ids").notNullable();
    t.text("resource").notNullable();
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("revoked_at", { useTz: true });
    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["user_id", "created_at"]);
  });
  await knex.schema.withSchema("public").createTable("asmblyr_mcp_authorizations", (t) => {
    t.string("request_hash", 64).primary();
    t.uuid("client_id").notNullable().references("id").inTable("public.asmblyr_mcp_clients");
    t.text("redirect_uri").notNullable();
    t.text("state").notNullable();
    t.string("challenge", 43).notNullable();
    t.jsonb("scopes").notNullable();
    t.text("resource").notNullable();
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.string("code_hash", 64).unique();
    t.uuid("connection_id").references("id").inTable("public.asmblyr_mcp_connections").onDelete("CASCADE");
    t.timestamp("decided_at", { useTz: true });
    t.timestamp("consumed_at", { useTz: true });
  });
  await knex.schema.withSchema("public").createTable("asmblyr_mcp_tokens", (t) => {
    t.string("access_hash", 64).primary();
    t.string("refresh_hash", 64).notNullable().unique();
    t.uuid("connection_id").notNullable().references("id").inTable("public.asmblyr_mcp_connections").onDelete("CASCADE");
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("consumed_at", { useTz: true });
  });
  await knex.schema.withSchema("public").createTable("asmblyr_mcp_schemas", (t) => {
    t.uuid("connection_id").notNullable().references("id").inTable("public.asmblyr_mcp_connections").onDelete("CASCADE");
    t.string("collection", 63).notNullable();
    t.uuid("collection_id").notNullable();
    t.primary(["connection_id", "collection"]);
  });
  await knex.schema.withSchema("public").createTable("asmblyr_tool_writes", (t) => {
    t.uuid("user_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    t.string("source", 64).notNullable();
    t.string("operation_id", 128).notNullable();
    t.string("input_hash", 64).notNullable();
    t.jsonb("result");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["user_id", "source", "operation_id"]);
  });
};

exports.down = async (knex) => {
  const connections = await knex("public.asmblyr_mcp_connections").first();
  const writes = await knex("public.asmblyr_tool_writes").first();
  if (connections || writes) throw new Error("Preserve MCP connections and tool-write history before rollback");
  for (const name of ["asmblyr_tool_writes", "asmblyr_mcp_schemas", "asmblyr_mcp_tokens", "asmblyr_mcp_authorizations", "asmblyr_mcp_connections", "asmblyr_mcp_clients"]) {
    await knex.schema.withSchema("public").dropTable(name);
  }
};
