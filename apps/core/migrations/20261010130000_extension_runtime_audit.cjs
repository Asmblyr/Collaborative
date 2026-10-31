exports.up = async function (knex) {
  await knex.raw("ALTER TABLE public.asmblyr_extension_history ALTER COLUMN actor_id DROP NOT NULL");
  await knex.schema.withSchema("public").alterTable("asmblyr_extension_history", (table) => {
    table.uuid("instance_id").nullable();
  });
};

exports.down = async function (knex) {
  const runtimeHistory = await knex("asmblyr_extension_history")
    .withSchema("public")
    .whereNull("actor_id")
    .first("id");
  if (runtimeHistory) {
    throw new Error("Cannot discard extension runtime audit history; restore a backup instead");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_extension_history", (table) => {
    table.dropColumn("instance_id");
  });
  await knex.raw("ALTER TABLE public.asmblyr_extension_history ALTER COLUMN actor_id SET NOT NULL");
};
