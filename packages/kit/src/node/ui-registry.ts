import { createRequire } from "node:module";
import { mkdir, readFile, realpath, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePluginNamespace } from "./collections.js";
import { isLocalPluginPackage } from "./local-package.js";

/** Generate static imports without ever executing server plugin entry points. */
export async function generateUiRegistry(
  projectPackage: URL,
  output: string,
  source = false,
): Promise<void> {
  const project = JSON.parse(await readFile(projectPackage, "utf8"));
  const names: unknown = project.asmblyr?.plugins ?? [];
  if (
    !Array.isArray(names) ||
    names.some(
      (name) =>
        typeof name !== "string" ||
        !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name),
    ) ||
    new Set(names).size !== names.length
  )
    throw new Error("Invalid configured UI plugins");
  const resolve = createRequire(projectPackage).resolve;
  const projectDirectory = path.dirname(fileURLToPath(projectPackage));
  const imports: string[] = [];
  const entries: string[] = [];
  const sources: string[] = [];
  for (const [index, name] of names.entries()) {
    const metadataPath = await realpath(resolve(`${name}/package.json`));
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    if (!metadata.exports?.["./ui"]) continue;
    if (metadata.name !== name || metadata.asmblyr?.manifest?.version !== 1)
      throw new Error(`Invalid plugin manifest: ${name}`);
    const namespace = parsePluginNamespace(metadata.asmblyr.manifest.namespace);
    if (!namespace) throw new Error("UI plugins require a namespace");
    const local = isLocalPluginPackage(
      projectDirectory,
      path.dirname(metadataPath),
    );
    const entry =
      source && local
        ? path.join(path.dirname(metadataPath), "ui/index.ts")
        : resolve(`${name}/ui`);
    await access(entry);
    const importPath = path
      .relative(path.dirname(output), entry)
      .replaceAll("\\", "/")
      .replace(/\.tsx?$/, "");
    imports.push(
      `import plugin${index} from ${JSON.stringify(importPath.startsWith(".") ? importPath : `./${importPath}`)};`,
    );
    entries.push(
      `{ packageName: ${JSON.stringify(name)}, namespace: ${JSON.stringify(namespace)}, definition: plugin${index} }`,
    );
    const cssPath = path
      .relative(path.dirname(output), path.dirname(entry))
      .replaceAll("\\", "/");
    sources.push(
      `@source ${JSON.stringify(cssPath.startsWith(".") ? cssPath : `./${cssPath}`)};`,
    );
  }
  const content = `// Generated from enabled package exports. Do not edit.\n"use client";\nimport type { UiPluginDefinition } from "@asmblyr-collaborative/kit/ui";\n${imports.join("\n")}\nexport const uiPlugins: { packageName: string; namespace: string; definition: UiPluginDefinition }[] = [${entries.join(",\n")}];\n`;
  await mkdir(path.dirname(output), { recursive: true });
  const previous = await readFile(output, "utf8").catch(() => "");
  if (previous !== content) await writeFile(output, content);
  const cssOutput = output.replace(/\.ts$/, ".css");
  const css = `${sources.join("\n")}\n`;
  if ((await readFile(cssOutput, "utf8").catch(() => "")) !== css)
    await writeFile(cssOutput, css);
}
