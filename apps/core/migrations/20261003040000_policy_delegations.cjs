exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_user_policy_delegations", (table) => {
      table
        .uuid("user_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("CASCADE");
      table
        .uuid("policy_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_policies")
        .onDelete("CASCADE");
      table.primary(["user_id", "policy_id"]);
      table.index("policy_id");
    });
};

exports.down = async (knex) => {
  const existing = await knex("public.asmblyr_user_policy_delegations").first(
    "user_id",
  );
  if (existing) {
    throw new Error(
      "Cannot roll back while policy delegation limits exist; remove them explicitly first",
    );
  }
  await knex.schema
    .withSchema("public")
    .dropTable("asmblyr_user_policy_delegations");
};
