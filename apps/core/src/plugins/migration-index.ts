import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { scanMigrationFiles, migrationNamePattern } from "@asmblyr/kit/node";
import type { MigrationDefinition } from "@asmblyr/kit";
import { isRecord } from "./definition.js";

export interface PluginMigration extends MigrationDefinition {
  name: string;
  checksum: string;
}

export interface PendingMigration {
  name: string;
  url: URL;
}

export async function sourceMigrations(
  root: string,
): Promise<PendingMigration[]> {
  const directory = path.join(root, "server/migrations");
  return (await scanMigrationFiles(directory)).map((file) => ({
    name: file.slice(0, -3),
    url: pathToFileURL(path.join(directory, file)),
  }));
}

export async function builtMigrations(index: URL): Promise<PendingMigration[]> {
  const files: unknown = JSON.parse(await readFile(index, "utf8"));
  if (!Array.isArray(files)) throw new Error("Invalid plugin migrations index");
  const entries: PendingMigration[] = [];
  const names = new Set<string>();
  for (const file of files) {
    const match =
      typeof file === "string" &&
      /^\.\/server\/migrations\/([^/]+)\.js$/.exec(file);
    if (!match || !migrationNamePattern.test(match[1]) || names.has(match[1]))
      throw new Error("Invalid or duplicate compiled migration path");
    names.add(match[1]);
    const url = new URL(file, index);
    await access(url);
    entries.push({ name: match[1], url });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return JSON.stringify(value);
  throw new Error("Migration plans must contain only JSON values");
}

export function parseMigration(value: unknown, name: string): PluginMigration {
  if (
    !migrationNamePattern.test(name) ||
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "operations") ||
    !Array.isArray(value.operations) ||
    !value.operations.length
  )
    throw new Error(`Invalid migration ${name}`);
  for (const operation of value.operations) {
    if (!isRecord(operation))
      throw new Error(`Invalid migration operation in ${name}`);
    let keys: string[] = [];
    if (operation.type === "addField")
      keys = ["type", "collection", "name", "field"];
    if (operation.type === "addIndex")
      keys = ["type", "collection", "name", "fields"];
    if (
      !keys.length ||
      Object.keys(operation).some((key) => !keys.includes(key)) ||
      typeof operation.collection !== "string" ||
      !/^[a-z][a-z0-9_]*$/.test(operation.collection) ||
      typeof operation.name !== "string" ||
      !/^[a-z][a-z0-9_]*$/.test(operation.name)
    )
      throw new Error(`Invalid migration operation in ${name}`);
    if (
      operation.type === "addIndex" &&
      (!Array.isArray(operation.fields) ||
        !operation.fields.length ||
        operation.fields.some((field) => typeof field !== "string") ||
        new Set(operation.fields).size !== operation.fields.length)
    )
      throw new Error(`Invalid index fields in ${name}`);
  }
  const checksum = createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex");
  return {
    name,
    checksum,
    operations: value.operations as MigrationDefinition["operations"],
  };
}

export async function importMigrations(
  entries: PendingMigration[],
): Promise<PluginMigration[]> {
  const migrations: PluginMigration[] = [];
  for (const entry of entries) {
    const module: { default?: unknown } = await import(entry.url.href);
    migrations.push(parseMigration(module.default, entry.name));
  }
  return migrations;
}
