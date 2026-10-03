exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_oauth_apps", (table) => {
    // Existing applications retain their explicit user assignments.
    table.string("access_mode", 20).notNullable().defaultTo("selected");
    table.jsonb("email_domains").notNullable().defaultTo("[]");
    table.check("access_mode IN ('all', 'selected', 'domains')", [], "oauth_apps_access_mode");
    table.check("jsonb_typeof(email_domains) = 'array'", [], "oauth_apps_email_domains");
    table.check(
      "access_mode <> 'domains' OR jsonb_array_length(email_domains) > 0",
      [],
      "oauth_apps_domains_required",
    );
  });
};

exports.down = async (knex) => {
  const configured = await knex("public.asmblyr_oauth_apps")
    .whereNot("access_mode", "selected")
    .orWhereRaw("email_domains <> '[]'::jsonb")
    .first("id");
  if (configured) throw new Error("Cannot discard OAuth application access settings");
  await knex.schema.withSchema("public").alterTable("asmblyr_oauth_apps", (table) => {
    table.dropChecks([
      "oauth_apps_access_mode",
      "oauth_apps_email_domains",
      "oauth_apps_domains_required",
    ]);
    table.dropColumns("access_mode", "email_domains");
  });
};
