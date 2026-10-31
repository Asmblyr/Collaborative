"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  TranslationsResult,
  TranslationCatalogs,
} from "@asmblyr-collaborative/contracts";
import { uiPluginModules } from "@/generated/plugin-ui";
import {
  createUiPluginLoader,
  watchUiPlugins,
  type UiPluginLoadResult,
} from "./registry-loader";
import { PluginRegistryContext } from "./registry-context";
import {
  TranslationProvider,
  useTranslations,
} from "@asmblyr-collaborative/kit/ui/i18n";
import { coreTranslations } from "@asmblyr-collaborative/contracts/translations";
import { useAppearance } from "@/components/settings/appearance-provider";

const loader = createUiPluginLoader(uiPluginModules);

export function PluginRegistryProvider({
  enabled,
  children,
}: {
  enabled: readonly string[];
  children?: ReactNode;
}) {
  const enabledKey = JSON.stringify([...new Set(enabled)].sort());
  const enabledNames = useMemo(
    () => new Set<string>(JSON.parse(enabledKey)),
    [enabledKey],
  );
  const [snapshot, setSnapshot] = useState<UiPluginLoadResult>({
    plugins: [],
    failed: [],
  });
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const retry = useCallback(() => setRetryRevision((value) => value + 1), []);
  const requestKey = `${enabledKey}:${retryRevision}`;
  useEffect(() => {
    return watchUiPlugins(loader, JSON.parse(enabledKey), (result) => {
      setSnapshot(result);
      setSettledKey(requestKey);
    });
  }, [enabledKey, requestKey]);
  const plugins = useMemo(
    () =>
      snapshot.plugins.filter((plugin) => enabledNames.has(plugin.packageName)),
    [snapshot.plugins, enabledNames],
  );
  const pending = enabledNames.size > 0 && settledKey !== requestKey;
  const failedNamespaces = useMemo(
    () =>
      snapshot.failed
        .filter((entry) => enabledNames.has(entry.packageName))
        .map((entry) => entry.namespace),
    [snapshot.failed, enabledNames],
  );
  const registry = useMemo(
    () => ({ plugins, pending, failedNamespaces, retry }),
    [plugins, pending, failedNamespaces, retry],
  );
  const { locale } = useAppearance();
  const [remote, setRemote] = useState<{
    locale: typeof locale;
    catalogs: Record<string, TranslationCatalogs>;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/translations?locale=${locale}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const result = (await response.json()) as TranslationsResult;
        if (!controller.signal.aborted) {
          setRemote({
            locale,
            catalogs: Object.fromEntries(
              Object.entries(result.data.plugins).map(
                ([namespace, messages]) => [
                  `plugin.${namespace}`,
                  { [locale]: messages },
                ],
              ),
            ),
          });
        }
      })
      .catch(() => {
        /* Bundled catalogs keep the UI usable while Core is unavailable. */
      });
    return () => controller.abort();
  }, [locale, enabledKey]);
  const catalogs = useMemo(
    () => ({
      core: coreTranslations,
      ...Object.fromEntries(
        plugins.map((plugin) => [
          `plugin.${plugin.namespace}`,
          plugin.definition.translations ?? {},
        ]),
      ),
      ...(remote?.locale === locale ? remote.catalogs : {}),
    }),
    [plugins, remote, locale],
  );
  return (
    <PluginRegistryContext.Provider value={registry}>
      <TranslationProvider
        locale={locale}
        catalogs={catalogs}
      >
        {children}
      </TranslationProvider>
    </PluginRegistryContext.Provider>
  );
}

export function useUiPlugins() {
  return useContext(PluginRegistryContext).plugins;
}

export function usePluginUiStatus() {
  return useContext(PluginRegistryContext);
}

export function usePluginPages() {
  const { translate } = useTranslations();
  return useUiPlugins().flatMap((plugin) =>
    (plugin.definition.pages ?? []).map((page) => ({
      ...page,
      title: translate(`plugin.${plugin.namespace}`, page.titleKey, page.title),
      namespace: plugin.namespace,
      href: `/extensions/${plugin.namespace}/${page.id}`,
    })),
  );
}
