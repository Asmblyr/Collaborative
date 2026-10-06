import path from "node:path";
import {
  readFile,
  realpath,
  mkdir,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";

function within(root, target) {
  const relative = path.relative(root, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
export function outputPath(cwd, input) {
  if (typeof input !== "string" || !input || path.isAbsolute(input)) {
    throw new Error("Output paths must be relative to the current project");
  }
  const target = path.resolve(cwd, input);
  if (!within(path.resolve(cwd), target) || target === path.resolve(cwd)) {
    throw new Error("Output path leaves the current project");
  }
  return target;
}
export function apiUrl(value) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    value.includes("\\")
  ) {
    throw new Error(
      "Use an HTTPS API root, or HTTP on localhost, without credentials/query/fragment",
    );
  }
  return url.href.replace(/\/+$/, "");
}
/**
 * @param {string} cwd
 * @param {string} file
 * @returns {Promise<{version: 1, url: string, schemaFile: string, typesFile: string}>}
 */
export async function readConfig(cwd, file) {
  const raw = JSON.parse(await readFile(outputPath(cwd, file), "utf8"));
  if (
    !raw ||
    raw.version !== 1 ||
    Object.keys(raw).some(
      (key) => !["version", "url", "schemaFile", "typesFile"].includes(key),
    )
  ) {
    throw new Error("Unsupported asm configuration");
  }
  const config = {
    version: 1,
    url: apiUrl(raw.url),
    schemaFile: raw.schemaFile,
    typesFile: raw.typesFile,
  };
  for (const key of ["schemaFile", "typesFile"]) {
    outputPath(cwd, config[key]);
  }
  if (
    new Set(
      [file, config.schemaFile, config.typesFile].map((p) =>
        outputPath(cwd, p),
      ),
    ).size !== 3
  ) {
    throw new Error("Config, schema and type outputs must be separate files");
  }
  return config;
}
export async function writeOutput(cwd, file, content) {
  const target = outputPath(cwd, file);
  const root = await realpath(cwd);
  const parts = path
    .relative(cwd, path.dirname(target))
    .split(path.sep)
    .filter(Boolean);
  let parent = cwd;
  for (const part of parts) {
    parent = path.join(parent, part);
    await mkdir(parent, { recursive: false }).catch((error) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });
    if (!within(root, await realpath(parent))) {
      throw new Error("Output directory leaves the current project");
    }
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
