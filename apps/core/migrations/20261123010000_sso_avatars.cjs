exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_sso_avatars", (table) => {
      table
        .uuid("user_id")
        .primary()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("CASCADE");
      table
        .uuid("file_id")
        .references("id")
        .inTable("public.asmblyr_files")
        .onDelete("SET NULL");
      table.string("provider", 48).notNullable();
      table.text("source_url");
      table.string("source_sha256", 64);
      table
        .timestamp("updated_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.index("file_id", "asmblyr_sso_avatars_file_idx");
    });
};

exports.down = async (knex) => {
  await knex.schema.withSchema("public").dropTable("asmblyr_sso_avatars");
};
