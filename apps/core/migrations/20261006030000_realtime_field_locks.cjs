exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_field_locks", (table) => {
    table.uuid("collection_id").notNullable().references("id").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.text("record_id").notNullable();
    table.text("field").notNullable();
    table.uuid("session_id").notNullable().references("id").inTable("public.asmblyr_auth_sessions").onDelete("CASCADE");
    table.uuid("client_id").notNullable();
    table.uuid("user_id").notNullable().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.primary(["collection_id", "record_id", "field"]);
    table.index("expires_at");
    table.index(["session_id", "client_id"]);
  });
};

// Locks are transient editor leases. Rolling back discards only active leases.
exports.down = async (knex) => {
  await knex.schema.withSchema("public").dropTable("asmblyr_field_locks");
};
