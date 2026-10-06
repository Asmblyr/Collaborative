"use client";

import {
  createContext,
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
import { uiPlugins } from "@/generated/plugin-ui";
import {
  TranslationProvider,
  useTranslations,
} from "@asmblyr-collaborative/kit/ui/i18n";
import { coreTranslations } from "@asmblyr-collaborative/contracts/translations";
import { useAppearance } from "@/components/settings/appearance-provider";

const RegistryContext = createContext<typeof uiPlugins>([]);

export function PluginRegistryProvider({
  enabled,
  children,
}: {
  enabled: readonly string[];
  children?: ReactNode;
}) {
  const plugins = useMemo(
    () => uiPlugins.filter((plugin) => enabled.includes(plugin.packageName)),
    [enabled],
  );
  const { locale } = useAppearance();
  const [remote, setRemote] = useState<{
    locale: typeof locale;
    catalogs: Record<string, TranslationCatalogs>;
  } | null>(null);
  const enabledKey = enabled.join("|");
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
    <RegistryContext.Provider value={plugins}>
      <TranslationProvider
        locale={locale}
        catalogs={catalogs}
      >
        {children}
      </TranslationProvider>
    </RegistryContext.Provider>
  );
}

export function useUiPlugins() {
  return useContext(RegistryContext);
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
