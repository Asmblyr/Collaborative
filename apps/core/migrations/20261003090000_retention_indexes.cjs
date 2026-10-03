exports.up = async (knex) => {
  await knex.raw(
    "CREATE INDEX asmblyr_item_events_retention_idx ON public.asmblyr_item_events (occurred_at)",
  );
  await knex.raw(
    "CREATE INDEX asmblyr_file_events_retention_idx ON public.asmblyr_file_events (created_at)",
  );
};
exports.down = async (knex) => {
  await knex.raw("DROP INDEX public.asmblyr_file_events_retention_idx");
  await knex.raw("DROP INDEX public.asmblyr_item_events_retention_idx");
};
