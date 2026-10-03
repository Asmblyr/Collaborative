const constraint = (
  files,
) => `ALTER TABLE public.asmblyr_permissions ADD CONSTRAINT asmblyr_permissions_target_check CHECK (
  (collection_id IS NOT NULL AND section IS NULL) OR
  (collection_id IS NULL AND section IS NOT NULL AND section IN ('users','policies','plugins','assistant','terms','services','oauth'${files ? ",'files'" : ""})
    AND action IN ('read','update') AND fields = ARRAY['*']::text[])
)`;
exports.up = async (knex) => {
  await knex.raw(
    "ALTER TABLE public.asmblyr_permissions DROP CONSTRAINT asmblyr_permissions_target_check",
  );
  await knex.raw(constraint(true));
};
exports.down = async (knex) => {
  if (
    await knex("public.asmblyr_permissions")
      .where({ section: "files" })
      .first("id")
  ) {
    throw new Error("Remove file-library grants explicitly before rollback");
  }
  await knex.raw(
    "ALTER TABLE public.asmblyr_permissions DROP CONSTRAINT asmblyr_permissions_target_check",
  );
  await knex.raw(constraint(false));
};
