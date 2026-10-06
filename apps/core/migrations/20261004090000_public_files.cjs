exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_files", (table) => {
    table.text("visibility").notNullable().defaultTo("private");
  });
  await knex.raw("ALTER TABLE public.asmblyr_files ADD CONSTRAINT asmblyr_files_visibility_check CHECK (visibility IN ('private', 'public'))");
};

exports.down = async (knex) => {
  if (await knex("public.asmblyr_files").where({ visibility: "public" }).first("id")) {
    throw new Error("Make published files private explicitly before rollback");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_files", (table) => {
    table.dropColumn("visibility");
  });
};
