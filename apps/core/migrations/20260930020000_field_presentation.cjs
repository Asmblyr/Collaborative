exports.up = async (knex) => {
  for (const name of ["asmblyr_field_metadata", "asmblyr_relation_aliases"]) {
    await knex.schema.withSchema("public").alterTable(name, (table) => {
      table.jsonb("presentation").notNullable().defaultTo("{}");
    });
    await knex.raw("ALTER TABLE ?? ADD CHECK (jsonb_typeof(presentation) = 'object')", [`public.${name}`]);
  }
};

exports.down = async (knex) => {
  for (const name of ["asmblyr_field_metadata", "asmblyr_relation_aliases"]) {
    await knex.raw("LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE", [`public.${name}`]);
    if (await knex(name).withSchema("public").whereRaw("presentation <> '{}'::jsonb").first("field_name")) {
      throw new Error("Cannot roll back while field presentation settings exist");
    }
  }
  for (const name of ["asmblyr_field_metadata", "asmblyr_relation_aliases"]) {
    await knex.schema.withSchema("public").alterTable(name, (table) => table.dropColumn("presentation"));
  }
};
