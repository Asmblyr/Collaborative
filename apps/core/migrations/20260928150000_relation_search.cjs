exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_relations", (table) => {
    table.boolean("searchable").notNullable().defaultTo(false);
  });
  await knex.schema.withSchema("public").alterTable("asmblyr_relation_aliases", (table) => {
    table.boolean("searchable").notNullable().defaultTo(false);
  });
};

exports.down = async (knex) => {
  const [relations, aliases] = await Promise.all([
    knex("asmblyr_relations").withSchema("public").where({ searchable: true }).first("source_field"),
    knex("asmblyr_relation_aliases").withSchema("public").where({ searchable: true }).first("field_name"),
  ]);
  if (relations || aliases) throw new Error("Cannot roll back enabled relation search settings");
  await knex.schema.withSchema("public").alterTable("asmblyr_relation_aliases", (table) => {
    table.dropColumn("searchable");
  });
  await knex.schema.withSchema("public").alterTable("asmblyr_relations", (table) => {
    table.dropColumn("searchable");
  });
};
