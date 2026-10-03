exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_service_federations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("service_id").notNullable().references("id").inTable("public.asmblyr_service_accounts").onDelete("CASCADE").index();
    t.string("name", 120).notNullable();
    t.string("project_id", 30).notNullable();
    t.string("project_path", 255).notNullable();
    t.string("ref", 255).notNullable();
    t.string("audience", 255).notNullable().unique();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_used_at", { useTz: true });
    t.timestamp("revoked_at", { useTz: true });
  });
  await knex.schema.withSchema("public").alterTable("asmblyr_service_tokens", (t) => {
    t.uuid("key_id").nullable().alter();
    t.uuid("federation_id").references("id").inTable("public.asmblyr_service_federations").onDelete("CASCADE").index();
    t.check("num_nonnulls(key_id, federation_id) = 1", [], "service_token_source");
  });
  await knex.schema.withSchema("public").createTable("asmblyr_federation_assertions", (t) => {
    // Only GitLab.com is supported; jti is globally unique within this issuer.
    t.string("jti_hash", 64).primary();
    t.timestamp("expires_at", { useTz: true }).notNullable().index();
  });
};

exports.down = async (knex) => {
  if (await knex("asmblyr_service_federations").first("id") ||
    await knex("asmblyr_federation_assertions").first("jti_hash")) {
    throw new Error("Cannot roll back populated federation configuration or replay protection");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_federation_assertions");
  await knex.schema.withSchema("public").alterTable("asmblyr_service_tokens", (t) => {
    t.dropChecks("service_token_source");
    t.dropColumn("federation_id");
    t.uuid("key_id").notNullable().alter();
  });
  await knex.schema.withSchema("public").dropTable("asmblyr_service_federations");
};
