import { lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { scanApiRoutes } from "./scan.js";
import { parsePluginNamespace, scanCollectionFiles } from "./collections.js";
import { scanMigrationFiles } from "./migrations.js";
import { scanHookFiles } from "./hooks.js";
import { parseCapabilities } from "../capabilities.js";
import {
  generateModelDefinitions,
  writeModelDefinitions,
} from "./model-generation.js";

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  });
}

export async function buildPlugin(directory: string): Promise<void> {
  const root = await realpath(directory);
  const metadata = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  if (metadata.asmblyr?.manifest?.version !== 1) {
    throw new Error(
      "Expected a plugin package with asmblyr.manifest.version 1",
    );
  }
  const routes = await scanApiRoutes(path.join(root, "server/api"));
  const collections = await scanCollectionFiles(
    path.join(root, "server/collections"),
  );
  const migrations = await scanMigrationFiles(
    path.join(root, "server/migrations"),
  );
  const hooks = await scanHookFiles(path.join(root, "server/hooks"));
  const settings = await lstat(path.join(root, "server/settings.ts")).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    },
  );
  if (settings && (!settings.isFile() || settings.isSymbolicLink())) {
    throw new Error("server/settings.ts must be a file, not a symlink");
  }
  const capabilities = parseCapabilities(
    metadata.asmblyr.manifest.capabilities,
  );
  if (
    (collections.length || migrations.length) &&
    !capabilities.includes("collections.manage")
  ) {
    throw new Error(
      "Collection declarations and migrations require collections.manage",
    );
  }
  if (settings && !capabilities.includes("settings")) {
    throw new Error("Settings declaration requires settings");
  }
  if (
    hooks.length &&
    !capabilities.some((entry) => entry.startsWith("hooks."))
  ) {
    throw new Error(
      "Hook declarations require hooks.items or hooks.collections",
    );
  }
  const namespace = parsePluginNamespace(metadata.asmblyr.manifest.namespace);
  if (
    hooks.length &&
    (!namespace || metadata.exports?.["./hooks"] !== "./dist/hooks.json")
  ) {
    throw new Error(
      'Hooks require a namespace and "./hooks": "./dist/hooks.json" export',
    );
  }
  if (
    settings &&
    (!namespace ||
      metadata.exports?.["./settings"] !== "./dist/server/settings.js")
  ) {
    throw new Error(
      'Settings require a namespace and "./settings": "./dist/server/settings.js" export',
    );
  }
  if (
    migrations.length &&
    (!namespace ||
      metadata.exports?.["./migrations"] !== "./dist/migrations.json")
  ) {
    throw new Error(
      'Migrations require a namespace and "./migrations": "./dist/migrations.json" export',
    );
  }
  if (collections.length && !namespace) {
    throw new Error(
      "Collection declarations require asmblyr.manifest.namespace",
    );
  }
  if (
    namespace &&
    metadata.exports?.["./collections"] !== "./dist/collections.json"
  ) {
    throw new Error(
      'Plugins with a namespace must export "./collections": "./dist/collections.json"',
    );
  }
  const configFile = path.join(root, "tsconfig.json");
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  if (config.error) {
    throw new Error(formatDiagnostics([config.error]));
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) {
    throw new Error(formatDiagnostics(parsed.errors));
  }

  const output = path.join(root, "dist");
  if (
    !parsed.options.outDir ||
    !parsed.options.rootDir ||
    path.resolve(parsed.options.outDir) !== output ||
    path.resolve(parsed.options.rootDir) !== root
  ) {
    throw new Error('Plugin tsconfig must use rootDir "." and outDir "dist"');
  }
  if (parsed.options.noEmit || parsed.options.emitDeclarationOnly) {
    throw new Error("Plugin build must emit JavaScript");
  }
  let program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmitOnError: true,
  });
  const models = generateModelDefinitions(program, root, routes);
  await writeModelDefinitions(root, models);
  if (models.size) {
    program = ts.createProgram(parsed.fileNames, {
      ...parsed.options,
      noEmitOnError: true,
    });
  }
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    throw new Error(formatDiagnostics(diagnostics));
  }
  const requiredSources = [
    "plugin.ts",
    ...(metadata.exports?.["./ui"] ? ["ui/index.ts"] : []),
    ...routes.map((route) => `server/api/${route.file}`),
    ...collections.map((file) => `server/collections/${file}`),
    ...migrations.map((file) => `server/migrations/${file}`),
    ...hooks.map((file) => `server/hooks/${file}`),
    ...(settings ? ["server/settings.ts"] : []),
  ];
  const checker = program.getTypeChecker();
  for (const file of requiredSources) {
    const source = program.getSourceFile(path.join(root, file));
    if (!source) {
      throw new Error(
        `Required source ${file} is missing from the plugin's tsconfig`,
      );
    }
    const module = checker.getSymbolAtLocation(source);
    const entry =
      module &&
      checker
        .getExportsOfModule(module)
        .find((symbol) => symbol.name === "default");
    if (!entry) {
      throw new Error(`${file} must have a default export`);
    }
    const type = checker.getTypeOfSymbolAtLocation(entry, source);
    if (file.startsWith("server/api/") && !type.getCallSignatures().length) {
      throw new Error(`${file} must default-export a handler function`);
    }
  }

  // Only the generated dist directory directly under this plugin can be removed.
  if (path.dirname(output) !== root || path.basename(output) !== "dist") {
    throw new Error("Plugin output must stay inside its package");
  }
  const existing = await lstat(output).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (existing?.isSymbolicLink()) {
    throw new Error("Plugin dist must not be a symlink");
  }
  await rm(output, { recursive: true, force: true });
  const emitted = program.emit();
  if (emitted.emitSkipped) {
    throw new Error(formatDiagnostics(emitted.diagnostics));
  }

  const index = routes.map((route) => ({
    ...route,
    file: `./server/api/${route.file.slice(0, -3)}.js`,
    ...(models.has(route.file) ? { model: models.get(route.file) } : {}),
  }));
  await writeFile(
    path.join(output, "routes.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  await writeFile(
    path.join(output, "hooks.json"),
    JSON.stringify(
      hooks.map((file) => `./server/hooks/${file.slice(0, -3)}.js`),
      null,
      2,
    ) + "\n",
  );
  const collectionIndex = collections.map(
    (file) => `./server/collections/${file.slice(0, -3)}.js`,
  );
  await writeFile(
    path.join(output, "collections.json"),
    `${JSON.stringify(collectionIndex, null, 2)}\n`,
  );
  console.log(`${metadata.name}: built ${routes.length} HTTP routes`);
  await writeFile(
    path.join(output, "migrations.json"),
    `${JSON.stringify(
      migrations.map((file) => `./server/migrations/${file.slice(0, -3)}.js`),
      null,
      2,
    )}\n`,
  );
}
