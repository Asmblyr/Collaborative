exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_user_invitations", (table) => {
    table.uuid("user_id").primary().references("id").inTable("public.asmblyr_users").onDelete("CASCADE");
    table.string("token_hash", 64).notNullable().unique();
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true });
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async (knex) => {
  const [{ count }] = await knex("asmblyr_user_invitations").withSchema("public")
    .whereNull("consumed_at").where("expires_at", ">", knex.fn.now()).count("* as count");
  if (Number(count) > 0) throw new Error("Cannot roll back while active invitations exist");
  await knex.schema.withSchema("public").dropTable("asmblyr_user_invitations");
};
