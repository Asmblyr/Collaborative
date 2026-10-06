exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_users", (table) => {
      table.string("first_name", 120);
      table.string("last_name", 120);
      table.text("description");
      table
        .uuid("avatar_id")
        .references("id")
        .inTable("public.asmblyr_files")
        .onDelete("RESTRICT");
      table.index("avatar_id", "asmblyr_user_avatar_idx");
      table
        .timestamp("updated_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.timestamp("last_login_at", { useTz: true });
      table.timestamp("last_active_at", { useTz: true });
    });
  await knex.raw("UPDATE public.asmblyr_users SET updated_at = created_at");
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_user_preferences", (table) => {
      table.string("timezone", 100);
    });
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_profile_extension", (table) => {
      table.integer("id").primary();
      table.check("id = 1");
      table
        .uuid("collection_id")
        .references("id")
        .inTable("public.asmblyr_collections")
        .onDelete("RESTRICT");
    });
  await knex("public.asmblyr_profile_extension").insert({ id: 1 });
};

exports.down = async (knex) => {
  const profile = await knex("public.asmblyr_users")
    .where((query) => {
      for (const field of [
        "first_name",
        "last_name",
        "description",
        "avatar_id",
        "last_login_at",
        "last_active_at",
      ]) {
        query.orWhereNotNull(field);
      }
    })
    .first("id");
  const extension = await knex("public.asmblyr_profile_extension")
    .whereNotNull("collection_id")
    .first("id");
  const timezone = await knex("public.asmblyr_user_preferences")
    .whereNotNull("timezone")
    .first("user_id");
  const foreignKeys = await knex("pg_constraint")
    .where({ conname: "asmblyr_user_profile_owner" })
    .first("oid");
  if (profile || extension || timezone || foreignKeys) {
    throw new Error(
      "Cannot discard user profiles, activity, timezone preferences or extension ownership",
    );
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_profile_extension");
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_user_preferences", (table) =>
      table.dropColumn("timezone"),
    );
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_users", (table) => {
      table.dropColumns(
        "first_name",
        "last_name",
        "description",
        "avatar_id",
        "updated_at",
        "last_login_at",
        "last_active_at",
      );
    });
};
