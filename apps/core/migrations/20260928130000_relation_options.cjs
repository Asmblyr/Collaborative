exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_relations", (table) => {
    table.string("on_delete", 16).notNullable().defaultTo("restrict");
  });
  await knex.schema.withSchema("public").createTable("asmblyr_relation_aliases", (table) => {
    table.string("collection_name", 63).notNullable()
      .references("name").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("field_name", 63).notNullable();
    table.string("kind", 3).notNullable();
    table.string("related_collection", 63).notNullable()
      .references("name").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("through_collection", 63).notNullable()
      .references("name").inTable("public.asmblyr_collections").onDelete("CASCADE");
    table.string("through_field", 63).notNullable();
    table.string("related_field", 63);
    table.primary(["collection_name", "field_name"]);
    table.index("through_collection", "asmblyr_relation_aliases_through_idx");
  });
  await knex.raw(`ALTER TABLE public.asmblyr_relation_aliases
    ADD CONSTRAINT asmblyr_relation_aliases_kind_check CHECK (kind IN ('o2m', 'm2m'))`);
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_relation_aliases IN ACCESS EXCLUSIVE MODE");
  const [{ count }] = await knex("asmblyr_relation_aliases").withSchema("public").count("* as count");
  if (Number(count) > 0) throw new Error("Cannot roll back while relation aliases exist");
  const custom = await knex("asmblyr_relations").withSchema("public")
    .whereNot("on_delete", "restrict").first("source_field");
  if (custom) throw new Error("Cannot roll back while custom delete actions exist");
  await knex.schema.withSchema("public").dropTable("asmblyr_relation_aliases");
  await knex.schema.withSchema("public").alterTable("asmblyr_relations", (table) => {
    table.dropColumn("on_delete");
  });
};
