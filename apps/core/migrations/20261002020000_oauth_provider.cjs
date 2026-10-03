exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_oauth_apps", (table) => {
    table.uuid("id").primary();
    table.string("name", 120).notNullable();
    table.text("description").notNullable().defaultTo("");
    table.boolean("enabled").notNullable().defaultTo(true);
    table.string("client_type", 20).notNullable();
    table.text("secret");
    table.jsonb("redirect_uris").notNullable();
    table.text("audience").notNullable();
    table.jsonb("scopes").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.check("client_type IN ('public', 'confidential')");
  });
  await knex.schema.withSchema("public").createTable("asmblyr_oauth_app_users", (table) => {
    table.uuid("app_id").references("id").inTable("public.asmblyr_oauth_apps").onDelete("CASCADE");
    table.uuid("user_id").references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.primary(["app_id", "user_id"]);
  });
  await knex.schema.withSchema("public").createTable("asmblyr_oauth_state", (table) => {
    table.string("model", 50).notNullable();
    table.string("id_hash", 64).notNullable();
    table.text("payload").notNullable();
    table.string("grant_hash", 64).index();
    table.string("uid_hash", 64).index();
    table.uuid("client_id").index();
    table.timestamp("expires_at", { useTz: true }).notNullable().index();
    table.timestamp("consumed_at", { useTz: true });
    table.primary(["model", "id_hash"]);
  });
  await knex.schema.withSchema("public").alterTable("asmblyr_users", (table) => {
    table.text("picture_url");
  });
};

exports.down = async (knex) => {
  const apps = await knex("public.asmblyr_oauth_apps").first("id");
  const picture = await knex("public.asmblyr_users").whereNotNull("picture_url").first("id");
  if (apps || picture) throw new Error("Cannot discard OAuth applications or profile images");
  await knex.schema.withSchema("public").dropTable("asmblyr_oauth_state");
  await knex.schema.withSchema("public").dropTable("asmblyr_oauth_app_users");
  await knex.schema.withSchema("public").dropTable("asmblyr_oauth_apps");
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_users", (table) => table.dropColumn("picture_url"));
};
