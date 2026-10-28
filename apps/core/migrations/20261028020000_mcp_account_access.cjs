exports.up = async (knex) => {
  // Preserve historical selections for rollback; current grants follow account ACL.
  await knex.raw("ALTER TABLE public.asmblyr_mcp_connections ALTER COLUMN collection_ids SET DEFAULT '[]'::jsonb");
};

exports.down = async (knex) => {
  await knex.raw("ALTER TABLE public.asmblyr_mcp_connections ALTER COLUMN collection_ids DROP DEFAULT");
};
