"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { uiPlugins } from "@/generated/plugin-ui";

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
  return (
    <RegistryContext.Provider value={plugins}>
      {children}
    </RegistryContext.Provider>
  );
}

export function useUiPlugins() {
  return useContext(RegistryContext);
}

export function usePluginPages() {
  return useUiPlugins().flatMap((plugin) =>
    (plugin.definition.pages ?? []).map((page) => ({
      ...page,
      namespace: plugin.namespace,
      href: `/extensions/${plugin.namespace}/${page.id}`,
    })),
  );
}
