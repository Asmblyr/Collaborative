import type { UiPluginDefinition } from "@asmblyr-collaborative/kit/ui";

export interface LoadedUiPlugin {
  packageName: string;
  namespace: string;
  definition: UiPluginDefinition;
}

export interface UiPluginModule {
  packageName: string;
  namespace: string;
  load: () => Promise<{ default: UiPluginDefinition }>;
}

export interface UiPluginLoadResult {
  plugins: LoadedUiPlugin[];
  failed: { packageName: string; namespace: string }[];
}

export interface UiPluginLoader {
  load(enabled: readonly string[]): Promise<UiPluginLoadResult>;
}

/** Share pending imports across StrictMode effects, without importing disabled packages. */
export function createUiPluginLoader(
  modules: readonly UiPluginModule[],
): UiPluginLoader {
  const cache = new Map<string, Promise<LoadedUiPlugin>>();

  function loadModule(entry: UiPluginModule): Promise<LoadedUiPlugin> {
    const existing = cache.get(entry.packageName);
    if (existing) {
      return existing;
    }
    const pending = Promise.resolve()
      .then(() => entry.load())
      .then((module) => {
        if (
          !module.default ||
          typeof module.default !== "object" ||
          Array.isArray(module.default)
        ) {
          throw new Error("Invalid UI plugin export");
        }
        return {
          packageName: entry.packageName,
          namespace: entry.namespace,
          definition: module.default,
        };
      })
      .catch((error) => {
        cache.delete(entry.packageName);
        throw error;
      });
    cache.set(entry.packageName, pending);
    return pending;
  }

  return {
    async load(enabled: readonly string[]): Promise<UiPluginLoadResult> {
      const allowed = new Set(enabled);
      const outcomes = await Promise.all(
        modules
          .filter((entry) => allowed.has(entry.packageName))
          .map(async (entry) => {
            try {
              return { plugin: await loadModule(entry) };
            } catch {
              return {
                failed: {
                  packageName: entry.packageName,
                  namespace: entry.namespace,
                },
              };
            }
          }),
      );
      return {
        plugins: outcomes.flatMap((outcome) =>
          outcome.plugin ? [outcome.plugin] : [],
        ),
        failed: outcomes.flatMap((outcome) =>
          outcome.failed ? [outcome.failed] : [],
        ),
      };
    },
  };
}

/** Each effect subscribes independently; cleanup prevents a stale activation from publishing. */
export function watchUiPlugins(
  loader: UiPluginLoader,
  enabled: readonly string[],
  publish: (result: UiPluginLoadResult) => void,
): () => void {
  let active = true;
  void loader.load(enabled).then((result) => {
    if (active) {
      publish(result);
    }
  });
  return () => {
    active = false;
  };
}
