exports.up = async function (knex) {
  await knex.schema.withSchema("public").createTable("asmblyr_terms", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 80).notNullable();
    table.text("description").notNullable();
    table.jsonb("aliases").notNullable().defaultTo("[]");
    table.boolean("enabled").notNullable().defaultTo(true);
    table.boolean("builtin").notNullable().defaultTo(false);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    "CREATE UNIQUE INDEX asmblyr_terms_name_unique ON public.asmblyr_terms (lower(name))",
  );
  await knex.schema.withSchema("public").createTable("asmblyr_collection_terms", (table) => {
    table
      .uuid("collection_id")
      .notNullable()
      .references("id")
      .inTable("public.asmblyr_collections")
      .onDelete("CASCADE");
    table
      .uuid("term_id")
      .notNullable()
      .references("id")
      .inTable("public.asmblyr_terms")
      .onDelete("RESTRICT");
    table.jsonb("filter").notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.primary(["collection_id", "term_id"]);
    table.index("term_id");
  });
  const defaults = [
    [
      "Активные",
      "Записи, которые сейчас участвуют в рабочем процессе. Точное условие активности задаётся для каждой коллекции.",
      ["активный", "активная", "действующие", "active"],
    ],
    [
      "Опубликованные",
      "Записи, подготовленные и опубликованные для использования. Само состояние публикации не определяет права доступа.",
      ["опубликовано", "опубликованные записи", "published"],
    ],
    [
      "Черновики",
      "Записи в процессе подготовки, ещё не готовые к публикации.",
      ["черновик", "черновые", "draft"],
    ],
    [
      "Архивные",
      "Записи, выведенные из текущего рабочего процесса и сохранённые для истории.",
      ["архив", "архивировано", "архивированные", "archived"],
    ],
  ];
  await knex("asmblyr_terms")
    .withSchema("public")
    .insert(
      defaults.map(([name, description, aliases]) => ({
        name,
        description,
        aliases: JSON.stringify(aliases),
        builtin: true,
      })),
    );
};

exports.down = async function () {
  throw new Error(
    "Terms may contain administrator definitions; export them before removing this migration manually",
  );
};
