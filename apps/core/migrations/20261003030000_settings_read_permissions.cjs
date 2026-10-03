const targetCheck = (actions) => `ALTER TABLE public.asmblyr_permissions
  ADD CONSTRAINT asmblyr_permissions_target_check CHECK (
    (collection_id IS NOT NULL AND section IS NULL) OR
    (collection_id IS NULL AND section IS NOT NULL
      AND section IN ('users', 'policies', 'plugins', 'assistant', 'terms', 'services', 'oauth')
      AND action IN (${actions}) AND fields = ARRAY['*']::text[])
  )`;

exports.up = async (knex) => {
  await knex.raw(`ALTER TABLE public.asmblyr_permissions
    DROP CONSTRAINT asmblyr_permissions_target_check`);
  await knex.raw(targetCheck("'read', 'update'"));
  await knex.raw("DROP INDEX public.asmblyr_permissions_section_unique");
  await knex.raw(`CREATE UNIQUE INDEX asmblyr_permissions_section_unique
    ON public.asmblyr_permissions (section, action) WHERE section IS NOT NULL`);
};

exports.down = async (knex) => {
  const reader = await knex("public.asmblyr_permissions")
    .whereNotNull("section")
    .where({ action: "read" })
    .first("id");
  if (reader) {
    throw new Error(
      "Cannot roll back while read-only settings permissions exist; remove them explicitly first",
    );
  }
  await knex.raw(`ALTER TABLE public.asmblyr_permissions
    DROP CONSTRAINT asmblyr_permissions_target_check`);
  await knex.raw(targetCheck("'update'"));
  await knex.raw("DROP INDEX public.asmblyr_permissions_section_unique");
  await knex.raw(`CREATE UNIQUE INDEX asmblyr_permissions_section_unique
    ON public.asmblyr_permissions (section) WHERE section IS NOT NULL`);
};
