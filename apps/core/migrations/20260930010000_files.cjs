exports.up = async (knex) => {
  await knex.schema.withSchema("public").createTable("asmblyr_files", (t) => {
    t.uuid("id").primary();
    t.string("storage", 500).notNullable();
    t.string("object_key", 255).notNullable();
    t.string("filename", 255).notNullable();
    t.string("title", 255).notNullable();
    t.text("description").notNullable().defaultTo("");
    t.string("mime_type", 255).notNullable();
    t.string("preview_type", 50);
    t.bigInteger("size").notNullable();
    t.string("sha256", 64).notNullable();
    t.string("status", 16).notNullable().defaultTo("uploading");
    t.uuid("uploaded_by").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["storage", "object_key"]);
    t.index(["created_at", "id"]);
    t.check("status IN ('uploading', 'ready', 'failed', 'deleting')");
    t.check("size >= 0");
  });
  await knex.schema.withSchema("public").createTable("asmblyr_file_events", (t) => {
    t.bigIncrements("id");
    // History survives file/user removal. Binary content and tokens are never recorded.
    t.uuid("file_id").notNullable();
    t.uuid("actor_id").notNullable();
    t.string("action", 24).notNullable();
    t.string("request_id", 100).notNullable();
    t.jsonb("changes").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["file_id", "id"]);
    t.index("created_at");
  });
};

exports.down = async (knex) => {
  for (const name of ["asmblyr_files", "asmblyr_file_events"]) {
    if (await knex(name).withSchema("public").first("id")) {
      throw new Error("Cannot roll back while files or file history exist");
    }
  }
  await knex.schema.withSchema("public").dropTable("asmblyr_file_events");
  await knex.schema.withSchema("public").dropTable("asmblyr_files");
};
