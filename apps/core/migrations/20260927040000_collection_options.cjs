exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.string("mode", 16).notNullable().defaultTo("multiple");
    table.string("primary_key_name", 63).notNullable().defaultTo("id");
    table.string("primary_key_type", 16).notNullable().defaultTo("uuid");
    table.boolean("created_at_enabled").notNullable().defaultTo(false);
    table.boolean("updated_at_enabled").notNullable().defaultTo(false);
  });
  await knex.raw("ALTER TABLE public.asmblyr_collections ADD CONSTRAINT asmblyr_collections_mode_check CHECK (mode IN ('multiple', 'single'))");
  await knex.raw("ALTER TABLE public.asmblyr_collections ADD CONSTRAINT asmblyr_collections_primary_key_type_check CHECK (primary_key_type IN ('uuid', 'serial', 'bigserial', 'text'))");
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_collections IN ACCESS EXCLUSIVE MODE");
  const [{ count }] = await knex("asmblyr_collections").withSchema("public")
    .whereRaw("mode <> 'multiple' OR primary_key_name <> 'id' OR primary_key_type <> 'uuid' OR created_at_enabled OR updated_at_enabled")
    .count("* as count");
  if (Number(count) > 0) {
    throw new Error("Cannot roll back collection options while configured collections exist");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_collections", (table) => {
    table.dropColumns("mode", "primary_key_name", "primary_key_type",
      "created_at_enabled", "updated_at_enabled");
  });
};
