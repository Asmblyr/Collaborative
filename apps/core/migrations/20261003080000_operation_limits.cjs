exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_request_buckets", (t) => {
      t.text("key").primary();
      t.integer("count").notNullable().defaultTo(1);
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
    });
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_assistant_leases", (t) => {
      t.uuid("id").primary();
      t.uuid("user_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("CASCADE");
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
    });
};
exports.down = async (knex) => {
  if (
    await knex("public.asmblyr_assistant_leases")
      .where("expires_at", ">", knex.fn.now())
      .first("id")
  ) {
    throw new Error("Cannot roll back active assistant requests");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_assistant_leases");
  await knex.schema.withSchema("public").dropTable("asmblyr_request_buckets");
};
