"use client";

import { useUiPlugins } from "./registry";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

export function useFieldInterfaces(type: string) {
  const { translate } = useTranslations();
  return useUiPlugins().flatMap((plugin) =>
    (plugin.definition.fieldInterfaces ?? [])
      .filter((field) => field.types.some((supported) => supported === type))
      .map((field) => ({
        ...field,
        title: translate(
          `plugin.${plugin.namespace}`,
          field.titleKey,
          field.title,
        ),
        id: `${plugin.namespace}:${field.id}`,
      })),
  );
}
