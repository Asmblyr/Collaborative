const permissionsConstraint = (
  skills,
) => `ALTER TABLE public.asmblyr_permissions ADD CONSTRAINT asmblyr_permissions_target_check CHECK (
  (collection_id IS NOT NULL AND section IS NULL) OR
  (collection_id IS NULL AND section IS NOT NULL AND section IN ('users','policies','plugins','assistant','terms','services','oauth','files'${skills ? ",'skills'" : ""})
    AND action IN ('read','update') AND fields = ARRAY['*']::text[])
)`;

exports.up = async (knex) => {
  await knex.raw(
    "ALTER TABLE public.asmblyr_permissions DROP CONSTRAINT asmblyr_permissions_target_check",
  );
  await knex.raw(permissionsConstraint(true));

  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_assistant_skills", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.string("slug", 64).notNullable();
      table.string("title", 120).notNullable();
      table.text("description").notNullable();
      table.text("instructions").notNullable();
      table.jsonb("examples").notNullable().defaultTo("[]");
      table.string("scope", 16).notNullable().defaultTo("global");
      table.string("audience", 16).notNullable().defaultTo("all");
      table.string("status", 16).notNullable().defaultTo("draft");
      table.boolean("expose_to_mcp").notNullable().defaultTo(false);
      table
        .uuid("created_by")
        .nullable()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("SET NULL");
      table
        .uuid("updated_by")
        .nullable()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("SET NULL");
      table
        .timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp("updated_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.index(["status", "expose_to_mcp"], "asmblyr_assistant_skills_status_mcp_idx");
    });

  await knex.raw(
    "CREATE UNIQUE INDEX asmblyr_assistant_skills_slug_unique ON public.asmblyr_assistant_skills (lower(slug))",
  );
  await knex.raw(
    "ALTER TABLE public.asmblyr_assistant_skills ADD CONSTRAINT asmblyr_assistant_skills_scope_check CHECK (scope IN ('global','collections'))",
  );
  await knex.raw(
    "ALTER TABLE public.asmblyr_assistant_skills ADD CONSTRAINT asmblyr_assistant_skills_audience_check CHECK (audience IN ('all','policies'))",
  );
  await knex.raw(
    "ALTER TABLE public.asmblyr_assistant_skills ADD CONSTRAINT asmblyr_assistant_skills_status_check CHECK (status IN ('draft','active'))",
  );

  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_assistant_skill_collections", (table) => {
      table
        .uuid("skill_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_assistant_skills")
        .onDelete("CASCADE");
      table
        .uuid("collection_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_collections")
        .onDelete("CASCADE");
      table.primary(["skill_id", "collection_id"]);
      table.index("collection_id", "asmblyr_assistant_skill_collections_collection_idx");
    });

  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_assistant_skill_policies", (table) => {
      table
        .uuid("skill_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_assistant_skills")
        .onDelete("CASCADE");
      table
        .uuid("policy_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_policies")
        .onDelete("CASCADE");
      table.primary(["skill_id", "policy_id"]);
      table.index("policy_id", "asmblyr_assistant_skill_policies_policy_idx");
    });
};

exports.down = async (knex) => {
  if (
    await knex("public.asmblyr_permissions")
      .where({ section: "skills" })
      .first("id")
  ) {
    throw new Error("Remove assistant-skills grants explicitly before rollback");
  }
  if (await knex("public.asmblyr_assistant_skills").first("id")) {
    throw new Error("Remove assistant skills explicitly before rollback");
  }
  await knex.schema
    .withSchema("public")
    .dropTableIfExists("asmblyr_assistant_skill_policies");
  await knex.schema
    .withSchema("public")
    .dropTableIfExists("asmblyr_assistant_skill_collections");
  await knex.schema
    .withSchema("public")
    .dropTableIfExists("asmblyr_assistant_skills");
  await knex.raw(
    "ALTER TABLE public.asmblyr_permissions DROP CONSTRAINT asmblyr_permissions_target_check",
  );
  await knex.raw(permissionsConstraint(false));
};
