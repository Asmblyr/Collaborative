import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import knex from "knex";
import { listCollections } from "../../src/collections/catalog-repository.js";
import { updateCollectionForm } from "../../src/collections/form-settings.js";
import { updateFieldPresentation } from "../../src/collections/field-presentation.js";
import { updateRelationSearch } from "../../src/collections/relation-search.js";
import { labels, authorLabels, layouts, statuses, translatedChoices } from "./presentation-plan.js";

const mode = process.argv[2];
if (!["--check", "--apply", "--restore"].includes(mode)) throw new Error("Use --check, --apply or --restore");
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["postgres:", "postgresql:"].includes(url.protocol)) {
  throw new Error("Presentation demo is restricted to local PostgreSQL");
}
const directory = new URL("../../../../.local-data/directus-transfer/", import.meta.url);
const backupFile = new URL("presentation-backup.json", directory);
const db = knex({ client: "pg", connection: process.env.DATABASE_URL, pool: { min: 0, max: 2 } });
type Backup = { name: string; formLayout: unknown; fields: { name: string; presentation: unknown; searchable?: boolean }[] }[];
type SourceMeta = { options?: { choices?: { value: string; text: string }[] }; translations?: { language: string; translation: string }[] };
const rollback = new Error("Check completed");
try {
  const collections = (await listCollections(db)).filter((c) => Object.hasOwn(layouts, c.name));
  if (collections.length !== Object.keys(layouts).length) throw new Error("Required demo collections are missing");
  const before: Backup = collections.map((c) => ({ name: c.name, formLayout: c.formLayout,
    fields: c.fields.map((f) => ({ name: f.name, presentation: f.presentation ?? {},
      ...(c.name === "shop_categories" && f.name === "category_id" ? { searchable: f.searchable === true } : {}) })) }));
  // Exclusive create: a repeat run must never overwrite the original settings.
  if (mode === "--apply") await writeFile(backupFile, JSON.stringify(before, null, 2) + "\n", { flag: "wx" });
  const metadata = JSON.parse(await readFile(new URL("metadata.json", directory), "utf8")) as {
    fields: Record<string, { field: string; meta?: SourceMeta }[]>;
  };
  try {
    await db.transaction(async (tx) => {
      await tx.raw("SET LOCAL lock_timeout = '5s'");
      if (mode === "--restore") {
        const backup = JSON.parse(await readFile(backupFile, "utf8")) as Backup;
        for (const c of backup) {
          if (!Object.hasOwn(layouts, c.name)) throw new Error("Unexpected collection in backup");
          for (const f of c.fields) {
            await updateFieldPresentation(tx, c.name, f.name, f.presentation);
            if (typeof f.searchable === "boolean") await updateRelationSearch(tx, c.name, f.name, { searchable: f.searchable });
          }
          await updateCollectionForm(tx, c.name, c.formLayout);
        }
        return;
      }
      for (const c of collections) {
        for (const f of c.fields) {
          const source = metadata.fields[c.name]?.find((s) => s.field === f.name)?.meta;
          const choices = source?.options?.choices;
          const presentation = { ...f.presentation,
            label: labels[c.name]?.[f.name] ?? authorLabels[f.name] ??
              source?.translations?.find((t) => t.language === "ru-RU")?.translation ?? f.presentation?.label ?? f.name,
            ...(choices?.length && f.type === "text" ? { interface: "select", options: choices.map((v) =>
              ({ value: v.value, label: translatedChoices[v.text] ?? v.text })) } : {}),
            ...(f.name === "status" ? { display: { kind: "status", statuses } } : {}),
            ...(["url", "extension_category_url"].includes(f.name) ? { interface: "url" } : {}),
            ...(c.name === "shops" && f.name === "local_categories" ? { relation: {
              ...f.presentation?.relation, layout: "table", columns: ["category_id", "status", "url", "id"], pageSize: 10,
            } } : {}),
          };
          await updateFieldPresentation(tx, c.name, f.name, presentation);
        }
        await updateCollectionForm(tx, c.name, layouts[c.name]);
        if (c.name === "shop_categories") await updateRelationSearch(tx, c.name, "category_id", { searchable: true });
      }
      if (mode === "--check") throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(JSON.stringify({ mode, collections: collections.map((c) => c.name), recordsChanged: 0, backup: "presentation-backup.json" }));
} catch (error) {
  // Do not print Knex queries/connection details.
  console.error(error instanceof Error && !Object.hasOwn(error, "code") ? error.message.split("\n")[0] : "Presentation update failed");
  process.exitCode = 1;
} finally { await db.destroy(); }
