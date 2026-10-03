exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_policies", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 120).notNullable().unique();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema("public").createTable("asmblyr_permissions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("policy_id").notNullable()
      .references("id").inTable("public.asmblyr_policies").onDelete("CASCADE");
    table.uuid("collection_id").notNullable()
      .references("id").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("action", 10).notNullable();
    table.specificType("fields", "text[]").notNullable();
    table.unique(["policy_id", "collection_id", "action"], "asmblyr_permissions_scope_unique");
    table.check("action IN ('create', 'read', 'update', 'delete')");
    table.check("cardinality(fields) > 0");
    table.index(["collection_id", "action"], "asmblyr_permissions_lookup_idx");
  });

  await knex.schema.withSchema("public").createTable("asmblyr_user_policies", (table) => {
    table.uuid("policy_id").notNullable()
      .references("id").inTable("public.asmblyr_policies").onDelete("CASCADE");
    table.uuid("user_id").notNullable()
      .references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.primary(["policy_id", "user_id"]);
    table.index("user_id", "asmblyr_user_policies_user_idx");
  });
};

exports.down = async (knex) => {
  const [{ count }] = await knex("asmblyr_policies").withSchema("public").count("* as count");
  if (Number(count) > 0) throw new Error("Cannot roll back policies while policies exist");
  await knex.schema.withSchema("public").dropTable("asmblyr_user_policies");
  await knex.schema.withSchema("public").dropTable("asmblyr_permissions");
  await knex.schema.withSchema("public").dropTable("asmblyr_policies");
};
