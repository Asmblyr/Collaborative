// Disposable local browser fixture; run with `setup` or `cleanup` from apps/core.
import "dotenv/config";
import knex from "knex";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.js";
import { authorizeTestApp } from "./authorized-app.js";

const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
const names = [
  "test_relation_ui_links",
  "test_relation_ui_people",
  "test_relation_ui_projects",
];
const [links, people, projects] = names;
if (process.argv[2] === "cleanup") {
  for (const name of names) {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").where({ name }).delete();
    await database("asmblyr_item_events")
      .where({ collection_name: name })
      .delete();
  }
} else if (process.argv[2] === "setup") {
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  async function call(method: "POST" | "PUT", url: string, payload: object) {
    const result = await app.inject({ method, url, payload });
    assert.ok(result.statusCode < 300, result.body);
    return result.json().data;
  }
  try {
    await call("POST", "/collections", {
      name: projects,
      fields: [{ name: "title", type: "text" }],
    });
    await call("POST", "/collections", {
      name: people,
      primaryKey: { name: "id", type: "serial" },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "email", type: "email" },
        { name: "active", type: "boolean" },
        { name: "score", type: "integer" },
      ],
    });
    await call("POST", `/collections/${projects}/relations`, {
      kind: "m2m",
      name: "members",
      targetCollection: people,
      junctionCollection: links,
      sourceKey: "project_id",
      targetKey: "person_id",
    });
    await call("POST", `/collections/${links}/fields`, {
      name: "role",
      type: "text",
      required: true,
    });
    await call("POST", `/collections/${links}/fields`, {
      name: "priority",
      type: "integer",
    });
    await call("PUT", `/collections/${links}/fields/role/presentation`, {
      label: "Роль в проекте",
      interface: "select",
      options: [
        { value: "editor", label: "Редактор" },
        { value: "author", label: "Автор" },
      ],
    });
    await call("PUT", `/collections/${links}/fields/priority/presentation`, {
      label: "Приоритет",
    });
    for (const [field, label] of [
      ["name", "Имя"],
      ["email", "Почта"],
      ["active", "Активен"],
      ["score", "Рейтинг"],
    ]) {
      await call("PUT", `/collections/${people}/fields/${field}/presentation`, {
        label,
      });
    }
    await call("PUT", `/collections/${projects}/fields/members/presentation`, {
      label: "Участники проекта",
      description: "Команда и роли участников",
      relation: {
        columns: ["name", "email", "active", "score"],
        labelField: "name",
        sortField: "score",
        direction: "desc",
      },
    });
    const project = await call("POST", `/items/${projects}`, {
      title: "Проверка таблицы связей",
    });
    const path = `/items/${projects}/${project.id}/relations/members`;
    for (let i = 1; i <= 12; i++) {
      const person = await call("POST", `/items/${people}`, {
        name: `Участник ${String(i).padStart(2, "0")}`,
        email: `member${i}@example.test`,
        active: i % 3 !== 0,
        score: 100 - i,
      });
      await call("POST", `${path}/links/to/${person.id}`, {
        role: "editor",
        priority: i,
      });
    }
    console.log(JSON.stringify({ collection: projects, id: project.id }));
  } finally {
    await app.close();
  }
} else throw new Error("Expected setup or cleanup");
await database.destroy();
