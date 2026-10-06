exports.up = async function (knex) {
  await knex.schema.withSchema("public").alterTable("asmblyr_user_preferences", (t) => {
    t.string("style", 16).notNullable().defaultTo("neutral");
    t.string("locale", 8).notNullable().defaultTo("ru");
    t.check("style IN ('neutral', 'ocean', 'coral')", [], "asmblyr_user_preferences_style_check");
    t.check("locale IN ('ru', 'en')", [], "asmblyr_user_preferences_locale_check");
  });
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (t) => {
    t.jsonb("translations").notNullable().defaultTo("{}");
  });
};

exports.down = async function (knex) {
  const translated = await knex("asmblyr_collections").withSchema("public")
    .whereRaw("translations <> '{}'::jsonb").first("id");
  const styled = await knex("asmblyr_user_preferences").withSchema("public")
    .where((q) => q.whereNot("style", "neutral").orWhereNot("locale", "ru"))
    .first("user_id");
  const fields = await knex("asmblyr_field_metadata").withSchema("public")
    .whereRaw("presentation->'translations' IS NOT NULL AND presentation->'translations' <> '{}'::jsonb")
    .first("field_name");
  if (translated || styled || fields) {
    throw new Error("Refusing to discard saved translations or appearance preferences");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (t) => {
    t.dropColumn("translations");
  });
  await knex.schema.withSchema("public").alterTable("asmblyr_user_preferences", (t) => {
    t.dropColumn("style");
    t.dropColumn("locale");
  });
};
