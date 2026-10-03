// Local disposable fixture. Run setup, verify (after UI scenario) or cleanup from apps/core; no credentials printed.
import "dotenv/config";
import assert from "node:assert/strict";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { authorizeTestApp } from "./authorized-app.js";

const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
const name = "test_forms_ui";
if (process.argv[2] === "verify") {
  const row = await database(name).where({ title: "Ассистент поддержки" }).first();
  assert.ok(row, "Expected the browser fixture record");
  assert.deepEqual(row.messages.map((message: { role: string }) => message.role), ["user", "system"]);
  assert.equal(row.messages[1].legacy, "keep-me");
  assert.equal(row.note, "Черновик комментария сохранён");
  console.log("Browser-saved row order, hidden-field draft and unknown JSON property verified");
} else if (process.argv[2] === "cleanup") {
  await database.schema.withSchema("public").dropTableIfExists(name);
  await database("asmblyr_collections").where({ name }).delete();
  await database("asmblyr_item_events").where({ collection_name: name }).delete();
} else if (process.argv[2] === "setup") {
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  async function call(method: "POST" | "PUT", url: string, payload: object) {
    const response = await app.inject({ method, url, payload });
    assert.ok(response.statusCode < 300, response.body); return response.json().data;
  }
  try {
    await call("POST", "/collections", { name, fields: [
      { name: "title", type: "text", required: true }, { name: "status", type: "text" }, { name: "amount", type: "decimal" },
      { name: "publish_at", type: "datetime" }, { name: "note", type: "text" }, { name: "messages", type: "json", required: true },
    ] });
    await call("PUT", `/collections/${name}/fields/title/presentation`, { label: "Название" });
    await call("PUT", `/collections/${name}/fields/status/presentation`, { label: "Статус", interface: "select",
      options: [{ value: "draft", label: "Черновик" }, { value: "ready", label: "Готово" }],
      display: { kind: "status", statuses: [{ value: "draft", label: "Черновик", color: "amber" }, { value: "ready", label: "Готово", color: "green" }] } });
    await call("PUT", `/collections/${name}/fields/amount/presentation`, { label: "Бюджет", display: { kind: "number", decimals: 2, grouping: true, prefix: "", suffix: " ₽" } });
    await call("PUT", `/collections/${name}/fields/publish_at/presentation`, { label: "Публикация", display: { kind: "date", format: "datetime", timeZone: "Asia/Yekaterinburg" } });
    await call("PUT", `/collections/${name}/fields/note/presentation`, { label: "Комментарий к публикации", interface: "textarea" });
    await call("PUT", `/collections/${name}/fields/messages/presentation`, { label: "Сообщения", interface: "repeater", repeater: {
      minItems: 1, maxItems: 10, labelField: "role", fields: [
        { name: "role", label: "Роль", type: "text", interface: "select", required: true, width: "half", options: [{ value: "system", label: "Система" }, { value: "user", label: "Пользователь" }] },
        { name: "text", label: "Текст сообщения", type: "text", interface: "markdown", required: true, width: "full" },
      ],
    } });
    const field = (name: string, half = false) => ({ id: name, kind: "field", field: name, width: half ? "half" : "full" });
    await call("PUT", `/collections/${name}/form`, { version: 1, tabs: [
      { id: "main", label: "Основное", children: [field("title"), field("status", true), field("amount", true),
        { ...field("note"), when: { mode: "all", rules: [{ field: "status", operator: "eq", value: "ready" }] } }] },
      { id: "content", label: "Контент", children: [{ id: "messages_group", kind: "group", label: "Диалог", description: "Последовательность сообщений для модели", collapsible: true, collapsed: true, children: [field("messages")] }] },
      { id: "schedule", label: "Расписание", children: [field("publish_at")] },
    ] });
    await call("PUT", `/collections/${name}/display`, { displayField: "title", displayTemplate: "{{title}} · {{status}}" });
    const item = await call("POST", `/items/${name}`, { title: "Ассистент поддержки", status: "ready", amount: "1234567.895", publish_at: "2026-09-30T12:30:00Z",
      note: "Публикуем после проверки", messages: [{ role: "system", text: "Ты помогаешь пользователям.", legacy: "keep-me" }, { role: "user", text: "Как настроить уведомления?" }] });
    console.log(JSON.stringify({ collection: name, id: item.id }));
  } finally { await app.close(); }
} else throw new Error("Expected setup, verify or cleanup");
await database.destroy();
