import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scanCollectionFiles } from "@asmblyr-collaborative/kit/node";
import {
  parsePluginCollection,
  type PluginCollection,
} from "./collection-definition.js";

export interface PendingCollection {
  name: string;
  url: URL;
}

export async function sourceCollections(
  root: string,
): Promise<PendingCollection[]> {
  const directory = path.join(root, "server/collections");
  const files = await scanCollectionFiles(directory);
  return files.map((file) => ({
    name: file.slice(0, -3),
    url: pathToFileURL(path.join(directory, file)),
  }));
}

export async function builtCollections(
  index: URL,
): Promise<PendingCollection[]> {
  const files: unknown = JSON.parse(await readFile(index, "utf8"));
  if (!Array.isArray(files))
    throw new Error("Invalid plugin collections index");
  const collections: PendingCollection[] = [];
  const names = new Set<string>();
  for (const file of files) {
    const match =
      typeof file === "string" &&
      /^\.\/server\/collections\/([a-z][a-z0-9_]*)\.js$/.exec(file);
    if (!match) throw new Error("Invalid compiled collection path");
    if (names.has(match[1]))
      throw new Error(`Duplicate collection: ${match[1]}`);
    names.add(match[1]);
    const url = new URL(file, index);
    await access(url);
    collections.push({ name: match[1], url });
  }
  return collections;
}

export async function importCollections(
  entries: PendingCollection[],
  namespace: string | undefined,
): Promise<PluginCollection[]> {
  if (!entries.length) return [];
  if (!namespace)
    throw new Error(
      "Collection declarations require asmblyr.manifest.namespace",
    );
  const result: PluginCollection[] = [];
  for (const entry of entries) {
    const module: { default?: unknown } = await import(entry.url.href);
    result.push(parsePluginCollection(module.default, namespace, entry.name));
  }
  return result;
}
