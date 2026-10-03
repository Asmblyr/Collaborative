exports.up = async (knex) => {
  await knex.schema.withSchema("public").alterTable("asmblyr_assistant_requests", (table) => {
    table.uuid("turn_id");
    table.integer("call_index").notNullable().defaultTo(1);
    table.check("call_index BETWEEN 1 AND 4", [], "asmblyr_assistant_requests_call_check");
    table.index(["turn_id", "call_index"], "asmblyr_assistant_requests_turn_idx");
  });
  await knex("public.asmblyr_assistant_requests").update({ turn_id: knex.ref("id") });
};

exports.down = async (knex) => {
  if (await knex("public.asmblyr_assistant_requests").where("call_index", ">", 1).first("id")) {
    throw new Error("Cannot discard assistant turn grouping");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_assistant_requests", (table) => {
    table.dropIndex([], "asmblyr_assistant_requests_turn_idx");
    table.dropColumn("call_index");
    table.dropColumn("turn_id");
  });
};
