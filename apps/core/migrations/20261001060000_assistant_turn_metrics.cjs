exports.up = async (knex) => {
  await knex.raw(`ALTER TABLE public.asmblyr_assistant_requests
    DROP CONSTRAINT asmblyr_assistant_requests_call_check,
    ADD CONSTRAINT asmblyr_assistant_requests_call_check CHECK (call_index >= 1)`);
  await knex.schema.withSchema("public").createTable("asmblyr_assistant_turns", (table) => {
    table.uuid("id").primary();
    // As with requests, retain actor IDs after account deletion, without profile copies.
    table.uuid("user_id").notNullable();
    table.timestamp("started_at", { useTz: true, precision: 3 }).notNullable();
    table.timestamp("finished_at", { useTz: true, precision: 3 });
    table.jsonb("summary");
    table.check("(finished_at IS NULL) = (summary IS NULL)");
    table.index(["started_at", "id"], "asmblyr_assistant_turns_time_idx");
    table.index(["user_id", "started_at", "id"], "asmblyr_assistant_turns_user_time_idx");
  });
};

exports.down = async (knex) => {
  const hasTurns = await knex("public.asmblyr_assistant_turns").first("id");
  const hasLongTurns = await knex("public.asmblyr_assistant_requests")
    .where("call_index", ">", 4)
    .first("id");
  if (hasTurns || hasLongTurns)
    throw new Error("Cannot discard assistant turn history or restore call limits");
  await knex.schema.withSchema("public").dropTable("asmblyr_assistant_turns");
  await knex.raw(`ALTER TABLE public.asmblyr_assistant_requests
    DROP CONSTRAINT asmblyr_assistant_requests_call_check,
    ADD CONSTRAINT asmblyr_assistant_requests_call_check CHECK (call_index BETWEEN 1 AND 4)`);
};
