import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { authorizeTestApp } from "./authorized-app.js";

const manifest = resolve("../../artifacts/reviews/2026-09-30/ui-fixture.json");
const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
if (process.argv[2] === "cleanup") {
  try {
    const { name } = JSON.parse(await readFile(manifest, "utf8"));
    if (
      typeof name !== "string" ||
      !/^test_ui_features_[a-f0-9]{8}$/.test(name)
    )
      throw new Error("Invalid disposable fixture name");
    await db("asmblyr_workspaces")
      .whereIn("name", [name, `${name}_new`])
      .delete();
    await db.schema.withSchema("public").dropTableIfExists(name);
    await db("asmblyr_collections").where({ name }).delete();
    await db("asmblyr_item_events").where({ collection_name: name }).delete();
    await unlink(manifest);
    console.log("Disposable UI fixture removed");
  } finally {
    await db.destroy();
  }
} else {
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, db);
  const name = `test_ui_features_${randomUUID().slice(0, 8)}`;
  async function call(method: "POST" | "PUT", url: string, payload: object) {
    const result = await app.inject({ method, url, payload });
    if (result.statusCode >= 400) throw new Error(result.body);
    return result.json().data;
  }
  try {
    await call("POST", "/collections", {
      name,
      fields: [
        { name: "title", type: "text", required: true },
        { name: "price", type: "decimal" },
        { name: "status", type: "text" },
        { name: "tags", type: "json" },
        { name: "cover", type: "file" },
        { name: "gallery", type: "files" },
      ],
    });
    await call("PUT", `/collections/${name}/fields/status/presentation`, {
      interface: "select",
      label: "Статус",
      width: "half",
      options: [
        { value: "draft", label: "Черновик" },
        { value: "published", label: "Опубликовано" },
      ],
    });
    await call("PUT", `/collections/${name}/fields/tags/presentation`, {
      interface: "multiselect",
      label: "Метки",
      options: [
        { value: "news", label: "Новости" },
        { value: "review", label: "Обзоры" },
      ],
    });
    await call("PUT", `/collections/${name}/fields/title/presentation`, {
      label: "Название",
      order: -1,
    });
    await call("PUT", `/collections/${name}/fields/price/presentation`, {
      label: "Цена",
      width: "half",
      description: "Точное дробное значение",
    });
    await call("PUT", `/collections/${name}/fields/cover/presentation`, {
      label: "Обложка",
    });
    await call("PUT", `/collections/${name}/fields/gallery/presentation`, {
      label: "Галерея",
    });
    for (const title of ["Тестовый материал", "Второй материал"])
      await call("POST", `/items/${name}`, {
        title,
        price: "1234.5678901234",
        status: "draft",
        tags: ["news"],
      });
    await mkdir(dirname(manifest), { recursive: true });
    await writeFile(manifest, JSON.stringify({ name }), "utf8");
    console.log(JSON.stringify({ name }));
  } finally {
    await app.close();
    await db.destroy();
  }
}
