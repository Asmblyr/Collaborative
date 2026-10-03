exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_policy_permissions", (table) => {
    table.uuid("policy_id").notNullable()
      .references("id").inTable("public.asmblyr_policies").onDelete("CASCADE");
    table.uuid("permission_id").notNullable()
      .references("id").inTable("public.asmblyr_permissions").onDelete("CASCADE");
    table.primary(["policy_id", "permission_id"]);
    table.index("permission_id", "asmblyr_policy_permissions_permission_idx");
  });
  await knex.raw("INSERT INTO public.asmblyr_policy_permissions (policy_id, permission_id) " +
    "SELECT policy_id, id FROM public.asmblyr_permissions");
  await knex.schema.withSchema("public").alterTable("asmblyr_permissions", (table) => {
    table.dropColumn("policy_id");
  });
};

exports.down = async (knex) => {
  const { rows: [result] } = await knex.raw(`
    SELECT
      EXISTS (
        SELECT 1 FROM public.asmblyr_permissions AS permission
        LEFT JOIN public.asmblyr_policy_permissions AS link
          ON link.permission_id = permission.id
        GROUP BY permission.id HAVING count(link.policy_id) <> 1
      ) AS ambiguous_links,
      EXISTS (
        SELECT 1 FROM public.asmblyr_policy_permissions AS link
        JOIN public.asmblyr_permissions AS permission ON permission.id = link.permission_id
        GROUP BY link.policy_id, permission.collection_id, permission.action
        HAVING count(*) > 1
      ) AS duplicate_scopes
  `);
  if (result.ambiguous_links || result.duplicate_scopes) {
    throw new Error("Cannot roll back shared permissions without losing or merging grants");
  }
  await knex.schema.withSchema("public").alterTable("asmblyr_permissions", (table) => {
    table.uuid("policy_id");
  });
  await knex.raw("UPDATE public.asmblyr_permissions AS permission SET policy_id = link.policy_id " +
    "FROM public.asmblyr_policy_permissions AS link WHERE link.permission_id = permission.id");
  await knex.raw("ALTER TABLE public.asmblyr_permissions ALTER COLUMN policy_id SET NOT NULL");
  await knex.schema.withSchema("public").alterTable("asmblyr_permissions", (table) => {
    table.foreign("policy_id").references("id").inTable("public.asmblyr_policies").onDelete("CASCADE");
    table.unique(["policy_id", "collection_id", "action"], "asmblyr_permissions_scope_unique");
  });
  await knex.schema.withSchema("public").dropTable("asmblyr_policy_permissions");
};
