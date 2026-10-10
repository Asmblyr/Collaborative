import { access, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isLocalPluginPackage,
  parsePluginNamespace,
  readPluginTranslations,
} from "@asmblyr-collaborative/kit/node";
import type { TranslationCatalogs } from "@asmblyr-collaborative/contracts";
import type { PluginCapability } from "@asmblyr-collaborative/kit";
import {
  approvedCapabilities,
  validatePluginCapabilities,
} from "./capabilities.js";
import {
  builtHooks,
  importHooks,
  sourceHooks,
  sourceSettings,
  importSettings,
  type PendingHook,
} from "./hook-index.js";
import {
  sourceMigrations,
  builtMigrations,
  importMigrations,
  type PendingMigration,
} from "./migration-index.js";
import {
  builtCollections,
  importCollections,
  sourceCollections,
  type PendingCollection,
} from "./collection-index.js";
import {
  isRecord,
  parsePluginDefinition,
  type LoadedPlugin,
} from "./definition.js";
import {
  builtEndpoints,
  importEndpoints,
  sourceEndpoints,
  type PendingEndpoint,
} from "./route-index.js";
import {
  parseRegistryPackage,
  type RegistryPackage,
} from "./registry-manifest.js";
import { resolveRegistryPackages } from "./registry-resolver.js";

const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

function configuredPlugins(value: unknown): string[] {
  if (!isRecord(value)) {
    throw new Error("Project package.json must contain an object");
  }
  if (value.asmblyr === undefined) {
    return [];
  }
  if (!isRecord(value.asmblyr)) {
    throw new Error("Expected an asmblyr configuration object");
  }
  const names = value.asmblyr.plugins;
  if (names === undefined) {
    return [];
  }
  if (
    !Array.isArray(names) ||
    !names.every(
      (name) => typeof name === "string" && packageNamePattern.test(name),
    )
  ) {
    throw new Error("asmblyr.plugins must contain npm package names");
  }
  if (new Set(names).size !== names.length) {
    throw new Error("Duplicate configured plugin package");
  }
  return names;
}

/** Reads the trusted project allowlist and manifests without executing package code. */
export async function readConfiguredRegistryPackages(
  projectPackage: URL,
  tolerateInvalid = false,
): Promise<RegistryPackage[]> {
  const project = JSON.parse(await readFile(projectPackage, "utf8"));
  const names = configuredPlugins(project);
  const resolve = createRequire(projectPackage).resolve;
  const packages: RegistryPackage[] = [];
  for (const name of names) {
    try {
      const manifestPath = await realpath(resolve(`${name}/package.json`));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      validateManifest(manifest, name);
      const entry = parseRegistryPackage(manifest, name);
      try {
        approvedCapabilities(project, entry.manifest, name);
      } catch (error) {
        entry.approvalIssue =
          error instanceof Error ? error.message : "Capability approval failed";
      }
      packages.push(entry);
    } catch (cause) {
      if (tolerateInvalid) {
        packages.push({
          name,
          version: "0.0.0",
          description: null,
          manifest: { version: 1 },
          validationIssue:
            cause instanceof Error ? cause.message : String(cause),
        });
        continue;
      }
      throw new Error(
        `Cannot load plugin ${name}; check its manifest, exports and build`,
        { cause },
      );
    }
  }
  return packages;
}

function validateManifest(value: unknown, name: string): string | undefined {
  if (
    !isRecord(value) ||
    value.name !== name ||
    !isRecord(value.asmblyr) ||
    !isRecord(value.asmblyr.manifest) ||
    value.asmblyr.manifest.version !== 1
  ) {
    throw new Error(
      `Plugin ${name}: expected matching package name and asmblyr.manifest.version 1`,
    );
  }
  const namespace = parsePluginNamespace(value.asmblyr.manifest.namespace);
  if (
    !namespace &&
    isRecord(value.exports) &&
    value.exports["./collections"] !== undefined
  ) {
    throw new Error("Collection exports require asmblyr.manifest.namespace");
  }
  return namespace;
}

export async function loadPlugins(
  projectPackage: URL,
  {
    sourcePlugins = false,
    disabledPackages = [],
    registryPackages,
    onFailure,
  }: {
    sourcePlugins?: boolean;
    disabledPackages?: readonly string[];
    registryPackages?: readonly RegistryPackage[];
    onFailure?: (name: string, error: string) => void;
  } = {},
): Promise<LoadedPlugin[]> {
  const project = JSON.parse(await readFile(projectPackage, "utf8"));
  const allowlist = new Set(configuredPlugins(project));
  if (registryPackages?.some((entry) => !allowlist.has(entry.name))) {
    throw new Error("Registry packages must belong to asmblyr.plugins");
  }
  const configured =
    registryPackages ?? (await readConfiguredRegistryPackages(projectPackage));
  const disabled = new Set(disabledPackages);
  const active = configured.filter((entry) => !disabled.has(entry.name));
  const resolution = resolveRegistryPackages(
    active,
    typeof project.version === "string" ? project.version : "0.0.0",
  );
  const errors = Object.entries(resolution.issues);
  if (errors.length && !onFailure) {
    const details = errors
      .map(([name, messages]) => `${name}: ${messages.join("; ")}`)
      .join(" | ");
    const namespaceIssue = errors
      .flatMap(([, messages]) => messages)
      .find((message) => message.startsWith("Namespace "));
    throw new Error(
      `Plugin dependency or compatibility check failed: ${details}`,
      {
        cause: new Error(
          namespaceIssue
            ? `Duplicate plugin namespace: ${namespaceIssue}`
            : details,
        ),
      },
    );
  }
  const names = resolution.order;
  const registryByName = new Map(
    configured.map((entry) => [entry.name, entry]),
  );
  const resolve = createRequire(projectPackage).resolve;
  const projectDirectory = path.dirname(fileURLToPath(projectPackage));
  const entries: {
    translations: TranslationCatalogs;
    name: string;
    namespace?: string;
    url: URL;
    routes: PendingEndpoint[];
    collections: PendingCollection[];
    migrations: PendingMigration[];
    hasUi: boolean;
    hooks: PendingHook[];
    settings?: URL;
    capabilities: PluginCapability[];
    registry: RegistryPackage;
  }[] = [];
  const namespaces = new Set<string>();
  const failed = new Set<string>();

  // Validate every package before executing any plugin code.
  for (const name of names) {
    const registryEntry = registryByName.get(name)!;
    const resolutionIssue = resolution.issues[name]?.join("; ");
    const preflightIssue =
      registryEntry.validationIssue ??
      registryEntry.approvalIssue ??
      resolutionIssue;
    if (preflightIssue && onFailure) {
      failed.add(name);
      onFailure(name, preflightIssue);
      continue;
    }
    try {
      const manifestPath = await realpath(resolve(`${name}/package.json`));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const namespace = validateManifest(manifest, name);
      const registry = registryByName.get(name)!;
      const currentRegistry = parseRegistryPackage(manifest, name);
      if (
        registry.version !== currentRegistry.version ||
        JSON.stringify(registry.manifest) !==
          JSON.stringify(currentRegistry.manifest)
      ) {
        throw new Error(`Plugin ${name}: manifest changed during discovery`);
      }
      const capabilities = approvedCapabilities(
        project,
        manifest.asmblyr.manifest,
        name,
      );
      if (namespace && namespaces.has(namespace)) {
        throw new Error(`Duplicate plugin namespace: ${namespace}`);
      }
      if (namespace) {
        namespaces.add(namespace);
      }
      const packageRoot = path.dirname(manifestPath);
      const translations = await readPluginTranslations(packageRoot);
      if (Object.keys(translations).length && !namespace) {
        throw new Error("Translations require a plugin namespace");
      }
      const isLocal = isLocalPluginPackage(projectDirectory, packageRoot);
      const useSource = sourcePlugins && isLocal;
      const url = pathToFileURL(
        useSource ? path.join(packageRoot, "plugin.ts") : resolve(name),
      );
      await access(url);
      const routes = useSource
        ? await sourceEndpoints(packageRoot)
        : await builtEndpoints(pathToFileURL(resolve(`${name}/routes`)), name);
      let collections: PendingCollection[] = [];
      if (useSource) {
        collections = await sourceCollections(packageRoot);
      } else if (namespace) {
        collections = await builtCollections(
          pathToFileURL(resolve(`${name}/collections`)),
        );
      }
      if (collections.length && !namespace) {
        throw new Error(
          "Collection declarations require asmblyr.manifest.namespace",
        );
      }
      let migrations: PendingMigration[] = [];
      if (useSource) {
        migrations = await sourceMigrations(packageRoot);
      } else if (
        isRecord(manifest.exports) &&
        manifest.exports["./migrations"] !== undefined
      ) {
        migrations = await builtMigrations(
          pathToFileURL(resolve(`${name}/migrations`)),
        );
      }
      if (migrations.length && !namespace) {
        throw new Error("Migrations require a namespace");
      }
      const hooks = useSource
        ? await sourceHooks(packageRoot)
        : manifest.exports?.["./hooks"]
          ? await builtHooks(pathToFileURL(resolve(`${name}/hooks`)))
          : [];
      const settings = useSource
        ? await sourceSettings(packageRoot)
        : manifest.exports?.["./settings"]
          ? pathToFileURL(resolve(`${name}/settings`))
          : undefined;
      if (settings) {
        await access(settings);
      }
      if ((hooks.length || settings) && !namespace) {
        throw new Error("Hooks and settings require a namespace");
      }
      if (
        (collections.length || migrations.length) &&
        !capabilities.includes("collections.manage")
      ) {
        throw new Error(
          "Collection declarations and migrations require collections.manage",
        );
      }
      if (
        hooks.length &&
        !capabilities.some((entry) => entry.startsWith("hooks."))
      ) {
        throw new Error(
          "Hook declarations require hooks.items or hooks.collections",
        );
      }
      if (settings && !capabilities.includes("settings")) {
        throw new Error("Settings declaration requires settings");
      }
      const hasUi =
        isRecord(manifest.exports) && manifest.exports["./ui"] !== undefined;
      entries.push({
        translations,
        name,
        namespace,
        url,
        routes,
        collections,
        migrations,
        hasUi,
        hooks,
        settings,
        capabilities,
        registry,
      });
    } catch (cause) {
      if (onFailure) {
        failed.add(name);
        onFailure(name, cause instanceof Error ? cause.message : String(cause));
        continue;
      }
      throw new Error(
        `Cannot load plugin ${name}; check its manifest, exports and build`,
        {
          cause,
        },
      );
    }
  }

  const plugins: LoadedPlugin[] = [];
  for (const {
    translations,
    name,
    namespace,
    url,
    routes,
    collections,
    migrations,
    hasUi,
    hooks,
    settings,
    capabilities,
    registry,
  } of entries) {
    const unavailable = Object.keys(registry.manifest.dependencies ?? {}).find(
      (dependency) => failed.has(dependency),
    );
    if (unavailable && onFailure) {
      failed.add(name);
      onFailure(name, `Required dependency ${unavailable} failed to start`);
      continue;
    }
    try {
      const module: { default?: unknown } = await import(url.href);
      const definition = parsePluginDefinition(module.default, name);
      const plugin: LoadedPlugin = {
        translations,
        name,
        namespace,
        hasUi,
        definition,
        capabilities,
        registry,
        hooks: await importHooks(hooks),
        settings: await importSettings(settings),
        endpoints: await importEndpoints(routes, name),
        collections: await importCollections(collections, namespace),
        migrations: await importMigrations(migrations),
      };
      validatePluginCapabilities(plugin);
      plugins.push(plugin);
    } catch (cause) {
      if (onFailure) {
        failed.add(name);
        onFailure(name, cause instanceof Error ? cause.message : String(cause));
        continue;
      }
      throw cause;
    }
  }
  return plugins;
}
