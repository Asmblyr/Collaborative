exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_relations", (table) => {
    table.string("target_collection", 63).nullable().alter();
    table.string("target_system", 32).nullable();
  });
  await knex.raw(`ALTER TABLE public.asmblyr_relations ADD CONSTRAINT asmblyr_relation_target_check
    CHECK ((target_collection IS NOT NULL AND target_system IS NULL)
      OR (target_collection IS NULL AND target_system IS NOT NULL AND target_system = 'users'))`);
};

exports.down = async (knex) => {
  await knex.raw("LOCK TABLE public.asmblyr_relations IN ACCESS EXCLUSIVE MODE");
  const relation = await knex("public.asmblyr_relations").whereNotNull("target_system").first();
  if (relation) {
    throw new Error("Remove system user relations before rolling back");
  }
  await knex.raw("ALTER TABLE public.asmblyr_relations DROP CONSTRAINT asmblyr_relation_target_check");
  await knex.schema.withSchema("public").alterTable("asmblyr_relations", (table) => {
    table.dropColumn("target_system");
    table.string("target_collection", 63).notNullable().alter();
  });
};
