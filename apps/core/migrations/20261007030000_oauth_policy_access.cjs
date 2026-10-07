exports.up = async function (knex) {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_oauth_apps", (table) => {
      table.boolean("policy_managed").notNullable().defaultTo(false);
      table.jsonb("scope_labels").notNullable().defaultTo("{}");
    });
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_policy_oauth_apps", (table) => {
      table
        .uuid("policy_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_policies")
        .onDelete("CASCADE");
      table
        .uuid("app_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_oauth_apps")
        .onDelete("CASCADE");
      table.jsonb("scopes").notNullable().defaultTo("[]");
      table.primary(["policy_id", "app_id"]);
      table.index("app_id");
    });
  for (const name of ["asmblyr_oauth_consents", "asmblyr_oauth_grants"]) {
    await knex.schema.withSchema("public").alterTable(name, (table) => {
      table.jsonb("service_scopes").notNullable().defaultTo("[]");
    });
  }
};

exports.down = async function (knex) {
  await knex.raw(`LOCK TABLE public.asmblyr_oauth_apps, public.asmblyr_oauth_consents,
    public.asmblyr_oauth_grants, public.asmblyr_policy_oauth_apps IN ACCESS EXCLUSIVE MODE`);
  const configured = await knex("public.asmblyr_oauth_apps")
    .where({ policy_managed: true })
    .orWhereRaw("scope_labels <> '{}'::jsonb")
    .first();
  const approved = await knex("public.asmblyr_oauth_consents")
    .whereRaw("service_scopes <> '[]'::jsonb")
    .first();
  const pending = await knex("public.asmblyr_oauth_grants")
    .whereRaw("service_scopes <> '[]'::jsonb")
    .first();
  if (
    configured ||
    approved ||
    pending ||
    (await knex("public.asmblyr_policy_oauth_apps").first())
  ) {
    throw new Error("Cannot discard configured application policies");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_policy_oauth_apps");
  for (const name of ["asmblyr_oauth_consents", "asmblyr_oauth_grants"]) {
    await knex.schema
      .withSchema("public")
      .alterTable(name, (table) => table.dropColumn("service_scopes"));
  }
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_oauth_apps", (table) => {
      table.dropColumn("policy_managed");
      table.dropColumn("scope_labels");
    });
};
