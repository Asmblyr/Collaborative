exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_assistant_requests", (table) => {
    table.uuid("id").primary();
    // Keep the actor ID if the account is deleted; do not retain a profile snapshot.
    table.uuid("user_id").notNullable();
    table.timestamp("started_at", { useTz: true, precision: 3 }).notNullable();
    table.timestamp("finished_at", { useTz: true, precision: 3 });
    table.integer("duration_ms");
    table.string("provider", 24).notNullable();
    table.string("api", 24).notNullable();
    table.string("requested_model", 120).notNullable();
    table.string("model", 256);
    table.string("status", 16).notNullable().defaultTo("pending");
    table.string("error_code", 64);
    table.string("reasoning_effort", 8);
    table.boolean("thinking");
    table.boolean("truncated");
    table.string("response_id", 256);
    table.string("request_id", 256);
    table.string("finish_reason", 256);
    for (const name of ["input_tokens", "output_tokens", "total_tokens", "cached_tokens", "reasoning_tokens"]) {
      table.integer(name);
      table.check("?? >= 0", [name]);
    }
    table.check("duration_ms >= 0");
    table.check("status IN ('pending', 'succeeded', 'failed', 'cancelled')");
    table.check("(status = 'pending' AND finished_at IS NULL AND duration_ms IS NULL) OR (status <> 'pending' AND finished_at IS NOT NULL AND duration_ms IS NOT NULL)");
    table.index(["started_at", "id"], "asmblyr_assistant_requests_time_idx");
    table.index(["user_id", "started_at", "id"], "asmblyr_assistant_requests_user_time_idx");
  });
};

exports.down = async (knex) => {
  if (await knex("asmblyr_assistant_requests").withSchema("public").first("id")) {
    throw new Error("Cannot discard assistant request history");
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_assistant_requests");
};
