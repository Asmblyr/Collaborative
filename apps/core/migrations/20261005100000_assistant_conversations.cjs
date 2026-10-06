exports.up = async (knex) => {
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_assistant_conversations", (table) => {
      table.uuid("id").primary();
      table
        .uuid("user_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_users")
        .onDelete("CASCADE");
      table.text("title").notNullable().defaultTo("");
      table
        .timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp("updated_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.integer("next_sequence").notNullable().defaultTo(0);
      table.integer("compaction_count").notNullable().defaultTo(0);
      table.uuid("active_message_id");
      table.timestamp("busy_until", { useTz: true });
      table.index(
        ["user_id", "updated_at", "id"],
        "asmblyr_assistant_conversations_user_time_idx",
      );
    });
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_assistant_messages", (table) => {
      table.uuid("id").primary();
      table
        .uuid("conversation_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_assistant_conversations")
        .onDelete("CASCADE");
      table.integer("sequence").notNullable();
      table.text("role").notNullable();
      table.uuid("reply_to");
      table.text("content").notNullable().defaultTo("");
      table.text("request_hash");
      table.text("status").notNullable();
      table.text("context_scope").notNullable();
      table.text("context_label").notNullable();
      table.boolean("truncated").notNullable().defaultTo(false);
      table.jsonb("summary");
      table
        .timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.unique(["conversation_id", "sequence"]);
      table.index(
        ["conversation_id", "context_scope", "sequence"],
        "asmblyr_assistant_messages_scope_idx",
      );
      table.check("role IN ('user', 'assistant')");
      table.check(
        "status IN ('pending', 'completed', 'failed', 'cancelled', 'interrupted')",
      );
    });
  await knex.schema
    .withSchema("public")
    .createTable("asmblyr_assistant_memories", (table) => {
      table
        .uuid("conversation_id")
        .notNullable()
        .references("id")
        .inTable("public.asmblyr_assistant_conversations")
        .onDelete("CASCADE");
      table.text("context_scope").notNullable();
      table.text("content").notNullable();
      table.integer("through_sequence").notNullable();
      table
        .timestamp("updated_at", { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.primary(["conversation_id", "context_scope"]);
    });
};

exports.down = async (knex) => {
  const existing = await knex("public.asmblyr_assistant_conversations").first(
    "id",
  );
  if (existing)
    throw new Error("Refusing to remove saved assistant conversations.");
  await knex.schema
    .withSchema("public")
    .dropTable("asmblyr_assistant_memories");
  await knex.schema
    .withSchema("public")
    .dropTable("asmblyr_assistant_messages");
  await knex.schema
    .withSchema("public")
    .dropTable("asmblyr_assistant_conversations");
};
