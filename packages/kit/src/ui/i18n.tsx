"use client";

import { createInstance } from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  TranslationCatalogs,
  UiLocale,
} from "@asmblyr-collaborative/contracts";
import { coreTranslations } from "@asmblyr-collaborative/contracts/translations";

const defaults = { core: coreTranslations };
const CatalogContext =
  createContext<Readonly<Record<string, TranslationCatalogs>>>(defaults);

/** Creates an isolated instance: no mutable process-wide locale during SSR. */
export function TranslationProvider({
  locale,
  catalogs = defaults,
  children,
}: {
  locale: UiLocale;
  catalogs?: Readonly<Record<string, TranslationCatalogs>>;
  children?: ReactNode;
}) {
  const instance = useMemo(() => {
    const resources = Object.fromEntries(
      ["ru", "en"].map((language) => [
        language,
        Object.fromEntries(
          Object.entries(catalogs).map(([namespace, messages]) => [
            namespace,
            messages[language as UiLocale] ?? {},
          ]),
        ),
      ]),
    );
    const i18n = createInstance();
    void i18n.init({
      lng: locale,
      fallbackLng: "ru",
      defaultNS: "core",
      resources,
      keySeparator: false,
      nsSeparator: false,
      initAsync: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    return i18n;
  }, [locale, catalogs]);
  return (
    <CatalogContext.Provider value={catalogs}>
      <I18nextProvider i18n={instance}>{children}</I18nextProvider>
    </CatalogContext.Provider>
  );
}

/** Public display catalogs only; also includes active plugins without a UI entry. */
export function useTranslationCatalogs() {
  return useContext(CatalogContext);
}

export function useTranslations(namespace = "core") {
  const { t, i18n } = useTranslation(namespace, { useSuspense: false });
  const locale: UiLocale = i18n?.language === "en" ? "en" : "ru";
  return {
    locale,
    t(
      key: string,
      fallback?: string,
      values?: Record<string, string | number>,
    ): string {
      // Components rendered outside the host (tests/previews) keep useful core labels.
      const original = coreTranslations[locale][key];
      return String(
        t(key, { ...values, defaultValue: fallback ?? original ?? key }),
      );
    },
    translate(
      namespace: string,
      key: string | undefined,
      fallback: string,
    ): string {
      return key
        ? String(t(key, { ns: namespace, defaultValue: fallback }))
        : fallback;
    },
  };
}

/** Namespace is the installed plugin manifest namespace, not its npm package name. */
export function usePluginTranslations(namespace: string) {
  return useTranslations(`plugin.${namespace}`);
}
