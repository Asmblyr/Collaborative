exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_service_keys", (table) => {
      table.timestamp("last_activity_at", { useTz: true });
      table.bigInteger("request_count").notNullable().defaultTo(0);
      table.check(
        "request_count >= 0",
        [],
        "service_key_request_count_nonnegative",
      );
    });
  await knex("asmblyr_service_keys")
    .withSchema("public")
    .update({
      last_activity_at: knex.ref("last_used_at"),
    });
};

exports.down = async (knex) => {
  await knex.raw(
    "LOCK TABLE public.asmblyr_service_keys IN ACCESS EXCLUSIVE MODE",
  );
  const activity = await knex("asmblyr_service_keys")
    .withSchema("public")
    .where("request_count", ">", 0)
    .orWhereRaw("last_activity_at IS DISTINCT FROM last_used_at")
    .first("id");
  if (activity) {
    throw new Error("Cannot roll back while service key activity exists");
  }
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_service_keys", (table) => {
      table.dropColumns("last_activity_at", "request_count");
    });
};
