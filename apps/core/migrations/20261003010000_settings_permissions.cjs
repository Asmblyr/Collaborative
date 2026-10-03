exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_permissions", (table) => {
      table.string("section", 40);
    });
  await knex.raw(`ALTER TABLE public.asmblyr_permissions
    ALTER COLUMN collection_id DROP NOT NULL,
    ADD CONSTRAINT asmblyr_permissions_target_check CHECK (
      (collection_id IS NOT NULL AND section IS NULL) OR
      (collection_id IS NULL AND section IS NOT NULL
        AND section IN ('users', 'policies', 'plugins', 'assistant', 'terms', 'services', 'oauth')
        AND action = 'update' AND fields = ARRAY['*']::text[])
    )`);
  await knex.raw(`CREATE UNIQUE INDEX asmblyr_permissions_section_unique
    ON public.asmblyr_permissions (section) WHERE section IS NOT NULL`);
};

exports.down = async (knex) => {
  const existing = await knex("public.asmblyr_permissions")
    .whereNotNull("section")
    .first("id");
  if (existing) {
    throw new Error(
      "Cannot roll back while settings permissions exist; remove them explicitly first",
    );
  }
  await knex.raw(`ALTER TABLE public.asmblyr_permissions
    DROP CONSTRAINT asmblyr_permissions_target_check,
    ALTER COLUMN collection_id SET NOT NULL`);
  await knex.schema
    .withSchema("public")
    .alterTable("asmblyr_permissions", (table) => {
      table.dropColumn("section");
    });
};
